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

Apply the updated Terraform configuration to align the deployment role's OIDC trust with `repo:OWNER/REPOSITORY:environment:ENVIRONMENT`. Review the plan before applying. An existing role that trusts only `ref:refs/heads/main` cannot authenticate this environment-based job.

The ECS cluster, services, repositories, database, and runtime secrets must already exist. Infrastructure creation remains a Terraform operation.

## Release behavior

The workflow reads the task definitions currently assigned to both ECS services, preserving their environment variables, roles, secrets, and network-related container configuration. `FRONTEND_TASK_DEFINITION` and `BACKEND_TASK_DEFINITION` variables are no longer needed.

Both images are built for `linux/amd64` and tagged with the commit SHA. The backend is deployed first; its startup runs database migrations. The frontend is deployed after the backend service stabilizes. Database changes must remain compatible with the previous frontend during rollout. A newer push does not cancel a release in progress.

Check the **Deploy to ECS** run in GitHub Actions for the result. A successful Git push alone does not confirm that the live website updated. If configuration validation fails, set the named variable or secret; if AWS authentication fails, check the environment name and apply the OIDC trust update.

This workflow uses GitHub's [reusable workflows](https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows) and AWS's [ECS task-definition render action](https://github.com/aws-actions/amazon-ecs-render-task-definition).
