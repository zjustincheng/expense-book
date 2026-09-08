# Infrastructure

Run local PostgreSQL with `docker compose -f infrastructure/compose.yaml up -d` from the repository root. The local credentials are development-only and the port binds to loopback.

`terraform/` is the first AWS foundation: private encrypted RDS, private versioned attachment storage, Cognito, Secrets Manager, ECR repositories, an ECS cluster, and application log groups. It consumes existing VPC/subnet/security-group IDs. No AWS resources have been provisioned.

Before deployment, complete the environment-specific layer: VPC routing/endpoints, ECS task definitions and services with distinct execution/runtime IAM roles, a least-privilege PostgreSQL application role, load balancer and health checks, TLS certificates, CloudFront with private-response caching disabled, Route 53 records, and a GitHub OIDC deployment role. Runtime secrets must be populated outside Terraform; applications must not use the RDS master account. The frontend's `API_INTERNAL_URL` must point to the private backend service. Configure encrypted remote Terraform state and locking before any shared use.

AWS region, domain, existing network, desired environment sizing, and AWS account are deliberately not guessed. Review a concrete Terraform plan before provisioning billable resources. CI currently validates code and Terraform; automated deployment will be added with the environment layer.

Cognito uses authorization code flow with PKCE. Set frontend `COGNITO_DOMAIN`, `COGNITO_CLIENT_ID`, and `APP_URL` from deployment outputs; set backend `JWT_ISSUER`, `JWT_AUDIENCE` (the Cognito client ID), and `JWT_JWKS_URL` (`<issuer>/.well-known/jwks.json`). Production requires `AUTH_MODE=jwt`; backend `HOST=0.0.0.0` is appropriate inside its private ECS task. Access tokens expire after one hour and require sign-in again in this first slice; refresh-token rotation and provider-wide logout remain follow-up work.
