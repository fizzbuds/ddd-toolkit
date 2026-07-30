# Releasing a new version

This project uses [Changesets](https://github.com/changesets/changesets) to manage versioning and publishing to npm.

## 1. Add a changeset

After making changes, create a changeset describing what changed:

```bash
pnpm changeset
```

Follow the prompts to select the affected package(s) (`@fizzbuds/ddd-toolkit`, `@fizzbuds/ddd-toolkit-rabbit-bus`) and the semver bump type (`patch`, `minor`, `major`).

This creates a `.changeset/<random-name>.md` file — commit it with your changes.

## 2. Push to `main`

Once the changeset is merged into `main`, the CI workflow (`node.js.yml`) will:

1. Run tests across Node 18/20 and MongoDB 4/5/6
2. The `changesets/action` opens a **"Version Packages"** PR that bumps versions and updates changelogs
3. Merge that PR → the action publishes the new version(s) to npm automatically

## 3. Troubleshooting

### npm 404 on publish

- **`NPM_TOKEN` expired?** → Generate a new token on [npmjs.com](https://www.npmjs.com) (Access Tokens) with publish permissions, then update the `NPM_TOKEN` secret at `https://github.com/fizzbuds/ddd-toolkit/settings/secrets/actions`
- **Access must be public** → `.changeset/config.json` must have `"access": "public"` (scoped packages on free npm orgs cannot be restricted)

### Manual publish (emergency)

```bash
npm login --scope=@fizzbuds
pnpm changeset version   # applies pending changesets → bumps versions
pnpm ci:publish --no-git-checks
```
