# GitHub Pages Deployment Guide

## Prerequisites

1. Make sure your code is committed to a GitHub repository
2. Run `npm install` to install dependencies (including angular-cli-ghpages)

## Important: Update Repository Name

**BEFORE deploying**, update the base-href in `package.json` line 10:

```json
"deploy": "ng build --configuration production --base-href /YOUR-REPO-NAME/ && npx angular-cli-ghpages --dir=dist/myclient/browser"
```

Replace `/myclient/` with `/your-actual-repo-name/`

## Deploy to GitHub Pages

Run this single command:

```bash
npm run deploy
```

This will:
1. Build your app for production
2. Set the correct base href for GitHub Pages
3. Deploy to the `gh-pages` branch
4. Push to GitHub

## Enable GitHub Pages

After first deployment:

1. Go to your GitHub repository
2. Click **Settings** → **Pages**
3. Under "Source", select: **Deploy from a branch**
4. Select branch: **gh-pages** and folder: **/ (root)**
5. Click **Save**

Your app will be live at: `https://your-username.github.io/your-repo-name/`

## Subsequent Deployments

Just run `npm run deploy` anytime you want to update the live site!

## Troubleshooting

- **404 errors**: Make sure base-href matches your repo name
- **Blank page**: Check browser console for errors related to base href
- **Not updating**: May take a few minutes for GitHub Pages to refresh
