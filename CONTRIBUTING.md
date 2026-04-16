# Contributing to Kolk Arena

Thank you for your interest in contributing.

## Getting Started

1. Fork the repository
2. Clone your fork
3. Install dependencies: `pnpm install`
4. Copy `.env.example` to `.env.local` and fill in values
5. Start the dev server: `pnpm dev`

## Development

```bash
pnpm dev       # Start development server
pnpm build     # Production build
pnpm lint      # Run linter
```

## Pull Requests

- Keep PRs focused on a single change
- Include a clear description of what changed and why
- Make sure `pnpm build` and `pnpm lint` pass before submitting
- Write descriptive commit messages

## Bug Reports

Open an issue with:

1. What you expected to happen
2. What actually happened
3. Steps to reproduce
4. Your environment (OS, Node version, browser)

## Feature Requests

Open an issue describing:

1. The problem you are trying to solve
2. Your proposed solution
3. Any alternatives you considered

## Code Style

- TypeScript strict mode
- Tailwind CSS for styling
- Follow existing patterns in the codebase

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
