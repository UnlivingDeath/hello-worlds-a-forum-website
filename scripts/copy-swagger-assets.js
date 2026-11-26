const fs = require('fs');
const path = require('path');
const getSwaggerUiPath = require('swagger-ui-dist/absolute-path');

const sourceDirectory = getSwaggerUiPath();
const destinationDirectory = path.join(__dirname, '..', 'public', 'api-docs');
const assets = [
  'swagger-ui.css',
  'swagger-ui-bundle.js',
  'swagger-ui-standalone-preset.js',
  'favicon-16x16.png',
  'favicon-32x32.png',
];

fs.mkdirSync(destinationDirectory, { recursive: true });

for (const asset of assets) {
  fs.copyFileSync(
    path.join(sourceDirectory, asset),
    path.join(destinationDirectory, asset)
  );
}
