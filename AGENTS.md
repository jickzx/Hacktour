# Hack Tour

## Guidelines

- Update this file when you find / change anything that would conflict with the knowledge in this file
- Try to keep files to under 200 lines of code, if file exceeds 200 lines separate it into modules where it makes sense
- In Include module docstrings in every file and JSDoc-style block comments above every function / component
  - Use simple language, keep these as short as possible, and make it so anyone can understand, avoid highly technical terminology, KISS (keep is stupid simple)
- Add a one line simple comment above any complex logic explaining it in simple terms (KISS, like for docstrings)
- Prefer `shadcn` components over custom implementations
- Use `npm` and `npx` for module installation

### Next.js

## Tech stack and frameworks

- `Next.js` for frontend 
- `shadcn` component library

## Repository layout and structure

- `Next.js` located in the `./frontend` directory

## Build / Lint / Test commands

### Next.js

- To start the server: `npm run dev`
- To run lint checks: `npm run lint`

## Design language

### Color scheme

## Documentation links

- Looks for skills `./.agents/skills` that match your task before making any decisions
- You can use webfetch to access the following documentations to look for implementation details
  - Shadcn documentation: https://ui.shadcn.com/docs/installation
  - React native documentation: https://reactnative.dev/docs/getting-started


## Pre hand-off instructions

- Always verify lint, build, and test commands show no errors before handing changes off to a user
