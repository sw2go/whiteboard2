# whiteboard2

To try it: https://your-username.github.io/your-repo-name/

To deploy: ```npm run deploy``` 

Hint: Make sure in package.json line 10, you point to your actual repo name:
  "deploy": "ng build --configuration production --base-href /YOUR-REPO-NAME/ ..."





Some more notes:

- go to the local repository
  cd repo-root-folder

- create new app in a subfolder "myclient"
  npx @angular/cli@20 new myclient
  Stylesheet format: Sass (SCSS)
  SSR              : N
  zoneless         : N
  AI-Tool          : Claude

- go to the "myclient" folder and start
  cd myclient
  npm run ng serve

- check at http://localhost:4200/

- add more angular libraries like @angular/material
  npm run ng add @angular/material
  Y
  Azure/blue

- add .claudeignore and .claudeinclude

- extend Claude.md ## Components section with:
  Use Angular Material UI components when ever possible

- add more ...features.md files to the .claude folder


- Dialog:
> What do you see

> add a ng-whiteboard component the requirements you see in whiteboard-features.md, do you need more info?

> Separate component, but then show it as app main page
