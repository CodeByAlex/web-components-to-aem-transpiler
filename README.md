# Web Component to AEM Component Transpiler

## Getting Started
To start using this project:

Generate your custom elements manifest using <b>@custom-elements-manifest/analyzer</b>. To make the most of this CLI, make sure to use JSDocs: https://custom-elements-manifest.open-wc.org/analyzer/getting-started/#supported-jsdoc

Then run:
```
npm install
npm start
```
and follow the command prompt


## Supported types

In order for the script to understand what xml to add to the dialog, it pulls the attribute type information from the custom elements manifest. The types currently supported include:
- string
- boolean
- number
- array


## References

This project was inspired by [webcomponent-to-aemcomponent](https://github.com/dirkstals/webcomponent-to-aemcomponent)
