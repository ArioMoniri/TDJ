# Getting help with T-DJ

## First, try these

- **Using the app**: the Guide inside T-DJ explains how a night is built. Settings → About shows your version.
- **Self-hosting**: `pnpm tdj doctor` checks your computer and reads the last deploy log, and names the fix for
  each problem. `pnpm tdj guide` prints the whole path; [docs/SELF_DEPLOY.md](docs/SELF_DEPLOY.md) has every route,
  the costs and the troubleshooting table.
- **Developing**: [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Where to ask

| You have… | Go to |
|---|---|
| A question ("how do I…", "is it possible to…") | [GitHub Discussions](https://github.com/ArioMoniri/TDJ/discussions) if they are open, otherwise an [issue](https://github.com/ArioMoniri/TDJ/issues/new/choose) |
| Something that does not work | a [bug report](https://github.com/ArioMoniri/TDJ/issues/new?template=bug_report.yml) |
| A wrong year, singer or orchestra | a [musical data correction](https://github.com/ArioMoniri/TDJ/issues/new?template=musical_data_correction.yml) |
| An idea | a [feature request](https://github.com/ArioMoniri/TDJ/issues/new?template=feature_request.yml) |
| A security problem | privately, see [SECURITY.md](SECURITY.md) |
| A commercial use in mind | an issue titled "Commercial use": the [licence](LICENSE) needs the author's written permission |

T-DJ is made by one DJ in Istanbul in spare time: answers can take a few days. There is no public T-DJ server and
no paid support. Never post an API key, a client secret or a setup code; `pnpm tdj doctor` output is safe to share.
