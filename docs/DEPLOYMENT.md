# GitHub deployment

Expense-book must be the Git repository root so GitHub can discover `.github/workflows`.

Pull requests run quality checks. Pushes to `main` and manual runs call the same checks before deployment: formatting, lint, types, backend tests, browser tests, dependency audit, Terraform validation, and container builds. Failed checks block deployment. Manual deployment is restricted to `main`.

## One-time configuration

Create a GitHub environment matching Terraform's `environment` value (for example, `development`). Restrict its deployment branches to `main` in GitHub environment settings. AWS trusts the environment name, so this branch restriction is important.

Set these **repository variables** under Settings → Secrets and variables → Actions:

| Variable      | Example        |
| ------------- | -------------- |
| `ENVIRONMENT` | `development`  |
| `AWS_REGION`  | `us-east-1`    |
| `NAME_PREFIX` | `expense-book` |

Set `AWS_DEPLOY_ROLE_ARN` as a secret in that GitHub environment, using the ARN of Terraform's `aws_iam_role.github_deploy` role. No AWS access keys are needed.

The deployment job's **Show OIDC trust claims** step reports the exact subject without exposing its authentication token. Set Terraform's `github_oidc_subject` to that subject in your local `terraform.tfvars`, then review and apply the plan. Newer repositories include immutable owner and repository IDs. For this repository's development environment, the observed subject is `repo:zjustincheng@125840269/expense-book@1360805191:environment:development`. The audience remains `sts.amazonaws.com`. A policy using the older name-only subject will not match this identity.

The ECS cluster, services, repositories, database, and runtime secrets must already exist. Infrastructure creation remains a Terraform operation.

## Release behavior

Receipt uploads go directly from the browser to the private S3 bucket using a temporary signed URL. Apply Terraform's `aws_s3_bucket_cors_configuration.attachments` setting to allow requests from `app_url`; pushing application code alone does not apply this configuration. Verify a real upload and download on the live website after applying. Browser regression tests substitute storage responses and do not verify AWS connectivity.

Receipt deletion also requires `s3:DeleteObject` in `aws_iam_role_policy.backend_runtime`, scoped to the attachment bucket's `groups/*` prefix. Apply that policy update if uploads and downloads work but deletion fails. The API keeps the database link when storage deletion fails so the operation can be retried. S3 versioning retains older object versions according to the bucket's retention policy.

The workflow reads the task definitions currently assigned to both ECS services, preserving their environment variables, roles, secrets, and network-related container configuration. `FRONTEND_TASK_DEFINITION` and `BACKEND_TASK_DEFINITION` variables are no longer needed.

Both images are built for `linux/amd64` and tagged with the commit SHA. The backend is deployed first; its startup runs database migrations. The frontend is deployed after the backend service stabilizes. Database changes must remain compatible with the previous frontend during rollout. A newer push does not cancel a release in progress.

Check the **Deploy to ECS** run in GitHub Actions for the result. A successful Git push alone does not confirm that the live website updated. If configuration validation fails, set the named variable or secret; if AWS authentication fails, check the environment name and apply the OIDC trust update.

This workflow uses GitHub's [reusable workflows](https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows) and AWS's [ECS task-definition render action](https://github.com/aws-actions/amazon-ecs-render-task-definition).
