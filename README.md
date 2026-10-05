# Synthetic ModernEDI acceptance workspace

This revision temporarily includes the [conversation release acceptance overlay](acceptance-fixtures/README.md).
`PUBLIC_SOURCE.json` describes the original baseline export, not that temporary overlay;
the overlay is reviewed in Git history and will be removed after configuration restoration.
It tests the published runner 0.6.0 and SDK 0.10.0; restoration also restores the baseline package pins.

This is a controlled, disposable test of the [public configuration example](https://github.com/modernedi/configuration-example), not a customer repository. **Never add real customer configuration or data here: workflow logs and artifacts are public.**

The dedicated workspace contains only the synthetic example. No EDI is sent. The additional, manually dispatched `dogfood.yml` workflow reuses the example's plan, saved-case verification, approval, and exact reviewed-apply jobs. Each job checks the pinned workspace identity, exact key scopes, and absence of automatic Git imports. Apply requires environment approval on protected main. The original private-copy workflows remain disabled here.

Provisioning and safety settings are maintained in ModernEDI's private provision-cdk module. `PUBLIC_SOURCE.json` describes this exact derived export and names its template repository; `DOGFOOD.json` identifies the fixture and source revision.

---

# ModernEDI configuration example

**Maps define how documents are processed; scenarios define and prove the business
conversation those maps implement. Git makes that configuration reviewable and
repeatable.** Start with a partner and a mapping; scenarios, saved tests, and Git
automation are optional steps you can add when they help.

This example follows a supplier receiving a retailer's 850 purchase order and
replying with an 810 invoice. It uses the published
[`@modernedi/configuration-runner`](https://github.com/modernedi/configuration-runner),
not a second deployment engine. The runner also works outside GitHub Actions.

## Try it without an account

Use Node.js 20 or later:

```sh
npm ci --ignore-scripts
npm run check
npm test
```

These checks are offline. They validate the bundle, shared public certificate,
references, optional scenario example, and CI adapter. They **do not** apply
configuration, evaluate mappings on a server, send EDI, or run a scenario.
ModernEDI also tests these sample mappings in its real backend before exporting
this repository. `plan` and `verify` below remain the authority for your workspace.

All names, documents, identifiers and certificates here are synthetic. The
`.invalid` AS2 endpoints intentionally cannot receive traffic. The public
certificate has no accompanying private key and is not for real use.

## How the pieces connect

| File | Purpose |
| --- | --- |
| [`modernedi/modernedi.json`](modernedi/modernedi.json) | Explicit inventory of the desired configuration. |
| [`connection.json`](modernedi/as2-connections/9d7e1e0c-1e98-4b44-a579-bf08d2642979/connection.json) | Separate Production/Test AS2 settings, both referencing one synthetic `certificates/shared.pem`. |
| [`partner.json`](modernedi/partners/61c5a052-9f83-49e9-a858-e7ddbc56a514/partner.json) | Retailer identity, X12 envelope settings, and connection reference. |
| [`purchase-order mapping`](modernedi/mappings/8ccf76f0-2701-4d4c-a5c4-94a453feec81/source.x12mapper) | Extracts `PO0001` from an 850 into JSON. Its adjacent `mapping.json` includes a saved input/expected-output case. |
| [`invoice mapping`](modernedi/mappings/4e948d62-a513-4fe7-8b88-12ba095b2b36/source.jslt) | Turns application JSON into an 810 body. Its saved case also requests generated-X12 validation. The transport adds envelopes when sending. |
| [`optional/`](optional/README.md) | An order/invoice scenario and Test-traffic binding using those same mappings. Not applied by the base bundle. |
| [`.github/workflows/`](.github/workflows) | Offline checks, opt-in PR planning, and protected post-merge apply. |

UUIDs are portable resource identities, not secrets or workspace database IDs.
Preserve the keys from your own export. The runner derives file/content hashes
in memory; don't update checksums by hand. The optional scenario's definition
hash is a separate semantic identity supplied by ModernEDI, not a raw-file hash.

The checked-in [JSON Schema](schemas/configuration-plan-request.schema.json) is
generated from the same OpenAPI contract as the SDKs. It checks the **prepared
API request**; authoring files may omit hashes that the runner computes.

## Keep the browser editor in your workflow

You do not have to adopt local editing to use Git. In ModernEDI's Mapper, edit
and test a map, review its configuration change, and apply it. Workspace Git
records the configuration, and an optional external connection can synchronize
it with your repository. Saved cases and scenario files travel in that same
configuration, not in a separate authoring system.

Choose **one import/apply owner** for a branch:

- **Browser-first:** use ModernEDI's external Git synchronization and optional
  import-test policy. Leave this repository's live apply workflow disabled.
- **CI-reviewed changes:** use the workflows below for external changes; disable
  automatic imports for that branch so CI and ModernEDI don't both apply a merge.
  Browser changes still go through ModernEDI's review/apply process. Bring its
  latest exported configuration into your branch before proposing another change.

The sample's `modernedi/` folder is the runner's bundle path, not an instruction
to change the external Git connector's repository layout. Follow the
[Git workflow guide](https://www.modernedi.com/docs/configuration-in-git) when
connecting a repository. Test and Production traffic share one workspace and
its mappings; a Test scenario is not a separately deployed test workspace.

## Adopt it safely

1. Use **Use this template** to create a **private** repository. Don't put real
   workspace exports, certificates, plans or customer data in a public fork.
2. Export your workspace's **complete current configuration** and put its desired
   files in `modernedi/`. Exclude the observed `_state/` snapshot. Adapt these
   examples into that export, preserving its existing resources and keys. A bundle
   describes the whole configuration: applying this small sample to an existing
   workspace can propose removing resources that aren't listed.
3. Replace synthetic AS2 endpoints, identities and the public certificate with
   settings agreed with your partner. Never commit API keys, private keys or
   passwords. Use ModernEDI's managed credential references where needed.
4. Run the offline checks, then use a `configuration:read` Integration API key
   from your secret store to make a real plan:

   ```sh
   npx --no-install modernedi-configuration plan --bundle ./modernedi --plan-out ./artifacts/plan.json
   ```

   Set `MODERNEDI_API_KEY` in the process environment, not a command-line argument
   or committed `.env` file. Review operations, diagnostics and scenario impact.
   Do not approve unexpected deletions. Plans contain workspace configuration;
   treat them as private even when the desired sample itself is public.

## Enable GitHub automation in your private copy

The public template has **no workspace secrets**. Live jobs require both a private
repository and the repository variable `MODERNEDI_LIVE_CI=true`.

Before setting that variable:

1. Protect `main`: require reviewed pull requests and the `check` job; disallow
   force pushes/deletion. Require owner review of `.github/`, `scripts/`, and
   dependency/lockfile changes. The post-merge job refuses an unprotected branch.
2. Create environment **`modernedi-plan`** with secret `MODERNEDI_API_KEY` holding
   only `configuration:read`. Allow `main`, from which the trusted PR workflow
   runs. Same-repository PRs are planned; fork PRs get offline checks only.
3. Create environment **`modernedi-apply`** with its own `MODERNEDI_API_KEY`
   granting `configuration:read` and `configuration:write`. Restrict it to
   protected `main`, **require a reviewer**, and disable bypass where available.
   Check your GitHub plan supports these environment protections in private
   repositories. If it does not, do not enable live apply; use reviewed manual
   runner commands instead. The workflow alone cannot install approval rules.
4. Optionally set `MODERNEDI_VERIFY_CASES=true`. The read-key plan job executes
   saved mapping cases on ModernEDI and records server-owned evidence. A failed
   verification blocks the apply job. This does not send EDI or prove live
   partner/scenario behavior. Scenarios are not required.
5. Confirm automatic Git imports will not race this CI apply, then enable
   `MODERNEDI_LIVE_CI`.

The lifecycle is:

```text
PR -> private plan (+ optional saved-case verification) -> reviewed merge
   -> fresh plan of that exact merged commit -> environment approval
   -> apply-reviewed -> retained operation result / workspace Change history
```

PR configuration is treated only as data: the plan workflow installs and runs
tools from the trusted base commit, never PR scripts or dependencies. Keep that
separation when adapting it. Actions are pinned; workflow tokens are read-only.

The post-merge plan is new evidence, not a claim that an earlier PR plan is still
current. Download its `reviewed-plan-…` artifact and inspect it **before** approving
`modernedi-apply`. `apply-reviewed` reloads the same bundle and rejects changed
workspace state or mismatched evidence. If saved cases were requested, it requires
the exact persisted verification run. Changes during approval require a new plan
and review, never a bypass.

## If a job stops

Artifacts are private to your copy and retained for seven days. The apply identity
is stable across attempts of the same workflow run. Don't create a new apply just
because its observation timed out: first inspect `apply-result-…/result.json` and
workspace Change history. With a read-capable key, resume observation:

```sh
npx --no-install modernedi-configuration wait --result ./artifacts/result.json --timeout-seconds 900
```

If no operation was accepted and the plan is stale, start a new workflow run and
review its fresh plan. A partially rerun job may not find an artifact from the
current attempt; it fails closed. Do not rename evidence or manually alter its
hashes to get past that check.

## Learn more

- [Configuration in Git](https://www.modernedi.com/docs/configuration-in-git)
- [Scenario guide and reference](https://www.modernedi.com/docs/scenarios/reference)
- [Runner commands, scopes and exit codes](https://github.com/modernedi/configuration-runner)
- [Integration API](https://www.modernedi.com/integration-api/)
- SDKs: [TypeScript](https://github.com/modernedi/typescript-sdk),
  [Python](https://github.com/modernedi/python-sdk), [.NET](https://github.com/modernedi/dotnet-sdk)

`PUBLIC_SOURCE.json` records the original reviewed template snapshot. It is
maintainer provenance, not a checksum lock on your own future configuration edits.
