# Infrastructure

See the [AWS infrastructure diagrams](architecture.md) for application traffic, networking, deployment, and operations.

Run local PostgreSQL with `docker compose -f infrastructure/compose.yaml up -d` from the repository root. The local credentials are development-only and the port binds to loopback.

`terraform/` is the AWS foundation: private encrypted RDS, private versioned attachment storage, Cognito, Secrets Manager, ECR repositories, ECS task definitions/services, private Cloud Map service discovery, application log groups, an HTTPS Application Load Balancer, CloudFront, Route 53, optional managed networking, CloudWatch alarms, and a GitHub OIDC deployment role. It can consume an existing VPC or create one with `create_network = true`. No AWS resources have been provisioned.

For shared use, create a dedicated encrypted S3 state bucket with versioning and restrictive public-access settings, then copy `terraform/backend.tf.example` to `backend.tf`, replace the bucket and region, and run `terraform init`. The S3 backend uses Terraform's native lock file; do not commit the account-specific backend file.

Before deployment, copy `terraform.tfvars.example`, choose either an existing network or `create_network = true`, and supply ACM certificates and DNS values. Set `github_repository = "owner/repository"` to provision the OIDC role. The ALB requires at least two public subnets and forwards HTTPS to private frontend tasks. CloudFront uses the us-east-1 certificate and disables caching so authenticated responses remain private; Route 53 points the application hostname at the distribution. Cloud Map registers backend tasks at a private DNS name for frontend-to-backend calls. Runtime secrets must be populated outside Terraform. Applications must not use the RDS master account. Configure encrypted remote Terraform state and locking before any shared use.

AWS region, domain, existing network, desired environment sizing, and AWS account are deliberately not guessed. Review a concrete Terraform plan before provisioning billable resources. CI validates code and Terraform. `.github/workflows/deploy.yml` builds immutable images and deploys ECS services through OIDC. Configure repository variables `AWS_REGION`, `AWS_ACCOUNT_ID`, `ENVIRONMENT`, `NAME_PREFIX`, `FRONTEND_TASK_DEFINITION`, and `BACKEND_TASK_DEFINITION`, plus secret `AWS_DEPLOY_ROLE_ARN` from the Terraform output. The first deployment requires an initial task definition created by Terraform.

Cognito uses authorization code flow with PKCE. Set frontend `COGNITO_DOMAIN`, `COGNITO_CLIENT_ID`, and `APP_URL` from deployment outputs; set backend `JWT_ISSUER`, `JWT_AUDIENCE` (the Cognito client ID), and `JWT_JWKS_URL` (`<issuer>/.well-known/jwks.json`). Production requires `AUTH_MODE=jwt`; backend `HOST=0.0.0.0` is appropriate inside its private ECS task. Access tokens expire after one hour and require sign-in again in this first slice; refresh-token rotation and provider-wide logout remain follow-up work.

Also set backend `COGNITO_DOMAIN` to the same HTTPS Cognito domain and `APP_URL` to the website origin. Invitation acceptance resolves the signed-in user's verified email through Cognito userInfo, matching its subject to the validated access token. Keep the `openid` and `email` OAuth scopes enabled. Invitation links survive the sign-in redirect; acceptance requires an explicit action.

Invitation email delivery is optional. Without `INVITATION_FROM_EMAIL`, admins can copy and share links. To enable Amazon SES, provision and verify a sender identity, set backend `AWS_REGION` and `INVITATION_FROM_EMAIL`, and give the backend runtime role `ses:SendEmail` scoped to that sender identity. SES identity/DNS records and IAM grants are not included in the current Terraform foundation. Check the account's SES sending restrictions before live use. No live messages have been sent or delivery tested here.

The Terraform IAM layer now creates separate ECS execution and backend runtime roles. The runtime role can read the application secret and access only `groups/*` objects in the private attachment bucket. Attach these roles to task definitions in the environment layer; do not reuse the RDS master credentials or execution role as the application role.

Run `terraform fmt` and `terraform validate` from a machine with a compatible AWS provider binary before planning. The checked-in environment layer has not been applied to an AWS account.

Delivery failures leave a usable invitation link and support explicit resend. A process interruption after claiming an email can leave its status as `sending`; admins can share the existing link or revoke it and create another invitation. This implementation does not provide a durable email queue or guaranteed delivery.
