# tdj-deploy

Your own [TDJ](https://github.com/ArioMoniri/TDJ) (tango DJ composer) on your AWS account, in one command.

```bash
npx tdj-deploy            # wizard: from this computer (AWS credentials) or through a GitHub fork
npx tdj-deploy doctor     # what is installed and signed in
npx tdj-deploy apple      # project owner: Apple + GitHub release setup (gh logged in)
npx tdj-deploy --help
```

It asks only what cannot be set inside the app later: the AWS region, the one-time deploy role (fork route),
and optionally your Spotify app (default: set it later at `/admin`). Secrets never go on a command line or
into a file. Full guide: [docs/SELF_DEPLOY.md](https://github.com/ArioMoniri/TDJ/blob/HEAD/docs/SELF_DEPLOY.md).
