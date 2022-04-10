#!/usr/bin/env node
const fs = require('fs');
const { resolve } = require('path');
const mkdirp = require('mkdirp');
const inquirer = require('inquirer');
const format = require('xml-formatter');

const templateDirectory = resolve(__dirname, 'templates');
const versionedComponentContentFile = fs.readFileSync(`${templateDirectory}/component/.content.xml`, 'utf8');
const versionedContentFile = fs.readFileSync(`${templateDirectory}/component/v1/.content.xml`, 'utf8');

let elementClassDefs = null;

const questionSetThree = [
    {
        type: 'input',
        name: 'group',
        message: 'Enter a component group for your library:',
    },
    {
        type: 'confirm',
        name: 'versioned',
        message: 'Do you wish to use versioned clientlibs?',
    },
    {
        type: 'input',
        name: 'projectName',
        message: 'Enter an AEM app directory (optional):',
    },
];

const getCustomElementClassDefinitions = (customElementsConfig) => {
    const customElementClassNames = new Set()
    for (const obj of customElementsConfig.modules) {
        if (obj.exports) {
            for (const exportObj of obj.exports) {
                if (exportObj.kind === 'custom-element-definition' && exportObj.declaration && exportObj.declaration.name) {
                    customElementClassNames.add(exportObj.declaration.name)
                }
            }
        }
    }
    return Array.from(customElementClassNames);
}

const customElementsJsonFile = fs.readFileSync(resolve(__dirname, process.argv.slice(2)[0]), 'utf8');
const customElementsConfig = JSON.parse(customElementsJsonFile);
if (!customElementsConfig || !customElementsConfig.modules) {
    console.log(`No custom elements found.`);
} else {
    elementClassDefs = getCustomElementClassDefinitions(customElementsConfig);
}

inquirer.prompt({
    type: 'list',
    name: 'elementName',
    message: 'Choose a custom element to transpile to an AEM component:',
    choices: ['All', ...elementClassDefs]
}).then(async ({ elementName }) => {
    inquirer.prompt(questionSetThree).then(async ({ group, versioned, projectName }) => {
        if (!customElementsConfig || !customElementsConfig.modules) {
            console.log(`No custom elements found.`);
        } else {
            try {
                const elements = elementName === 'All' ? elementClassDefs : [elementName];
                for (const element of elements) {
                    console.log(`Creating ${element} AEM Component.`);
                    const rootDirectory = getRootComponentDirPath(projectName, element);
                    mkdirp.sync(rootDirectory);
                    const contentFile = fs.readFileSync(`${templateDirectory}/.content.xml`, 'utf8');
                    fs.writeFileSync(`${rootDirectory}/.content.xml`, contentFile);
                    let componentDirectory = `${rootDirectory}/${element}`;
                    mkdirp.sync(componentDirectory);

                    if (versioned) {
                        fs.writeFileSync(`${componentDirectory}/.content.xml`, versionedComponentContentFile);
                        mkdirp.sync(`${componentDirectory}/v1`);
                        fs.writeFileSync(`${componentDirectory}/v1/.content.xml`,
                            versionedContentFile.replace(/\{component\}/g, element)
                        );

                        componentDirectory = `${rootDirectory}/${element}/v1/${element}`;
                        mkdirp.sync(componentDirectory);
                    }

                    const customElementObject = getCustomElementObject(customElementsConfig, element);
                    generateComponentContentXML(templateDirectory, componentDirectory, element, group);
                    generateComponentHTMLFile(templateDirectory, componentDirectory, element, customElementObject);
                    generateCQDialogContentFile(templateDirectory, componentDirectory, element, customElementObject);
                }
            } catch (e) {
                console.log(e);
            }
        }
    });
});

const getTitle = (c) => (c.charAt(0).toUpperCase() + c.slice(1)).split(/(?=[A-Z])/).join(' ');

const getCustomElementObject = (customElementsConfig, className) => {
    for (const obj of customElementsConfig.modules) {
        if (obj.kind === 'javascript-module' && obj.declarations) {
            for (const declaration of obj.declarations) {
                if (declaration.name === className) {
                    return declaration;
                }
            }
        }
    }
    return;
}

const getRootComponentDirPath = (projectName, elementName) => {
    const buildDirectory = resolve(__dirname, 'dist');
    return projectName !== ''
        ? `${buildDirectory}/jcr_root/apps/${projectName}/components/content/${elementName}`
        : `${buildDirectory}/${elementName}`;
}

const isAttributeTypeFunction = (attr) => {
    return attr.type.text === 'function' || attr.type.text.indexOf('=>') > -1
}

const generateComponentContentXML = (templateDirectory, componentDirectory, elementName, group) => {
    const componentContentFile = fs.readFileSync(`${templateDirectory}/component/v1/component/.content.xml`, 'utf8');
    fs.writeFileSync(`${componentDirectory}/.content.xml`,
        format(componentContentFile
            .replace(/\{title\}/g, getTitle(elementName))
            .replace(/\{group\}/g, group)));
}

const generateComponentHTMLFile = (templateDirectory, componentDirectory, elementName, elementObj) => {
    const componentHtmlFile = fs.readFileSync(`${templateDirectory}/component/v1/component/component.html`, 'utf8');
    const attributes = elementObj.attributes ? elementObj.attributes : [];
    const slots = elementObj.slots;

    fs.writeFileSync(`${componentDirectory}/${elementName}.html`,
        format(componentHtmlFile
            .replace(/\{tag\}/g, elementObj.tagName)
            .replace(/\{attributes\}/g, attributes.map(attr => {
                if (!isAttributeTypeFunction(attr)) return `${attr.name}="\$\{properties.${attr.name.replace(/-/g, '_')}\}"`
            }).join(` `))
            .replace(/\{slot\}/g, slots ? 'Add custom (slot) content here' : '')
            .replace(/\{comment\}/g, () => {
                if (attributes.filter(attr => isAttributeTypeFunction(attr)).length > 0) {
                    return `<!-- The following attributes are functions and should be added manually:${attributes.map(attr => {
                        if (isAttributeTypeFunction(attr)) return `\n${attr.name}:${attr.description}`;
                    }).join(``)} -->`
                }
                return '';
            }))
    );
}

const generateCQDialogContentFile = (templateDirectory, componentDirectory, elementName, elementObj) => {
    const componentContentDialogFile = fs.readFileSync(`${templateDirectory}/component/v1/component/_cq_dialog/.content.xml`, 'utf8');
    const attributes = elementObj.attributes ? elementObj.attributes : [];
    mkdirp.sync(`${componentDirectory}/_cq_dialog`);
    fs.writeFileSync(
        `${componentDirectory}/_cq_dialog/.content.xml`,
        format(componentContentDialogFile
            .replace(/\{title\}/g, getTitle(elementName))
            .replace(/\{attributes\}/g, attributes.map(attr => {
                if (!isAttributeTypeFunction(attr)) {
                    console.log(attr)
                    if (attr.type.text.toLowerCase() === 'boolean') {
                        return `<${attr.name}
                        jcr:primaryType="nt:unstructured"
                        sling:resourceType="granite/ui/components/coral/foundation/form/checkbox"
                        checked="${attr.default}"
                        fieldLabel="${getTitle(attr.name)}"
                        name="./${attr.name.replace(/-/g, '_')}"/>`;
                    } else if (attr.type.text.toLowerCase() === 'number') {
                        return `<${attr.name}
                        jcr:primaryType="nt:unstructured"
                        sling:resourceType="granite/ui/components/coral/foundation/form/numberfield"
                        value="${attr.default}"
                        fieldLabel="${getTitle(attr.name)}"
                        name="./${attr.name.replace(/-/g, '_')}"/>`;
                    } else if (attr.type.text.toLowerCase() === 'array' || attr.type.text.indexOf('[]') > -1) {
                        return `
                        <${attr.name}
                            jcr:primaryType="nt:unstructured"
                            sling:resourceType="granite/ui/components/coral/foundation/form/multifield"
                            composite="{Boolean}true"
                            fieldLabel="${getTitle(attr.name)}">
                            <field
                                jcr:primaryType="nt:unstructured"
                                sling:resourceType="granite/ui/components/coral/foundation/container"
                                name="./multifield">
                                <items jcr:primaryType="nt:unstructured">
                                    <column
                                        jcr:primaryType="nt:unstructured"
                                        sling:resourceType="granite/ui/components/coral/foundation/container">
                                        <items jcr:primaryType="nt:unstructured">
                                            <item
                                                jcr:primaryType="nt:unstructured"
                                                sling:resourceType="granite/ui/components/coral/foundation/form/textfield"
                                                fieldLabel="Item"
                                                name="./item"/>
                                        </items>
                                    </column>
                                </items>
                            </field>
                        </${attr.name}>`;
                    }
                    else { // treat attr as a string
                        return `<${attr.name}
                        jcr:primaryType="nt:unstructured"
                        sling:resourceType="granite/ui/components/coral/foundation/form/textfield"
                        value="${attr.default}"
                        fieldLabel="${getTitle(attr.name)}"
                        name="./${attr.name.replace(/-/g, '_')}"/>`;
                    }
                }
            }).join(``))));
}