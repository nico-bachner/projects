# Infra

One OpenTofu configuration with one state for all hosting, split into a file per provider:

- `github.tf`: the `projects` repository, its default branch, vulnerability alerts, Actions permissions, `main` ruleset, and Actions secrets.

Every setting is declared, defaults included. State lives under `terraform.tfstate` in the `tofu-state` R2 bucket, encrypted with a passphrase. Keep the passphrase, the R2 keys, and the tokens below in a password manager; GitHub secrets cannot be read back.

## CI

The `Infra` workflow plans on pull requests that touch `infra/` and applies on `main`. It reads every credential from the Actions secrets that `github.tf` manages.

## Running locally

Only bootstrap and recovery need a local run. Set these environment variables:

- `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`: the R2 token for `tofu-state`.
- `GITHUB_TOKEN`: a token that can administer `projects`, such as `gh auth token`.
- `TF_VAR_state_passphrase`: the state passphrase.
- `TF_VAR_r2_access_key_id` and `TF_VAR_r2_secret_access_key`: the R2 token again, stored for CI.
- `TF_VAR_github_admin_token`: a fine-grained token with Administration and Secrets read and write on `projects`, stored for CI.
- `TF_VAR_homebrew_tap_token`: a fine-grained token with Contents read and write on `homebrew-tap`.

Then, from the repository root:

```sh
tofu -chdir=infra init
tofu -chdir=infra plan -out=tfplan
tofu -chdir=infra apply tfplan
```

Apply only after reviewing the plan.
