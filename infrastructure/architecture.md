# AWS infrastructure diagram

This diagram describes the checked-in Terraform and application code, not a live AWS inventory. Resource names and region are parameterized. Mermaid diagrams render on GitHub and can be edited as text.

## Application and network

```mermaid
flowchart TB
    user["User / browser"]
    dns["Amazon Route 53<br/>Application hostname"]
    cf["Amazon CloudFront<br/>HTTPS · caching disabled"]
    cognito["Amazon Cognito<br/>User pool + hosted sign-in<br/>Authorization code + PKCE"]

    subgraph region["AWS region"]
        subgraph vpc["Application VPC"]
            subgraph public["Public subnets · two Availability Zones"]
                alb["Application Load Balancer<br/>HTTPS listener :443"]
                nat["One NAT Gateway<br/>First public subnet"]
                igw["Internet Gateway"]
            end
            subgraph private["Private subnets · two Availability Zones"]
                fe["ECS Fargate · frontend<br/>Next.js · port 3000"]
                be["ECS Fargate · backend<br/>API · port 4000"]
                discovery["AWS Cloud Map<br/>Private backend DNS"]
                db[("Amazon RDS PostgreSQL 17<br/>Encrypted · port 5432<br/>Multi-AZ in production")]
                cleanup["ECS Fargate · cleanup task<br/>Expired attachment reservations"]
                egress["Task outbound traffic"]
            end
        end
        s3[("Amazon S3 · attachments<br/>Private · encrypted · versioned")]
        secrets["AWS Secrets Manager<br/>Application DATABASE_URL"]
        scheduler["EventBridge Scheduler<br/>Once per day"]
    end

    user -. "DNS lookup" .-> dns
    dns -. "Alias" .-> cf
    user -->|HTTPS| cf
    cf -->|HTTPS :443| alb
    alb -->|HTTP :3000| fe
    fe -->|HTTP :4000 · API proxy| be
    fe -. "Resolve backend hostname" .-> discovery
    discovery -. "Registered backend task IPs" .-> be
    be -->|SQL :5432| db
    user <-->|Sign-in redirects| cognito
    fe -->|Exchange authorization code| cognito
    be -->|JWKS / userInfo| cognito
    be -->|Object access and checks| s3
    user <-->|Presigned HTTPS upload / download| s3
    secrets -. "Injected at task startup" .-> be
    secrets -. "Injected at task startup" .-> cleanup
    scheduler -->|RunTask| cleanup
    cleanup -->|Reservation cleanup| db
    cleanup -->|Delete expired objects| s3
    fe -.-> egress
    be -.-> egress
    cleanup -.-> egress
    egress -.-> nat
    nat -.-> igw
    igw -.-> internet["Internet / public AWS service endpoints"]

    classDef edge fill:#e8eaff,stroke:#6554c0,color:#172033
    classDef compute fill:#fff0da,stroke:#d97706,color:#172033
    classDef storage fill:#e8f5e9,stroke:#388e3c,color:#172033
    classDef support fill:#edf2f7,stroke:#64748b,color:#172033
    class dns,cf,cognito edge
    class alb,fe,be,cleanup compute
    class db,s3 storage
    class discovery,secrets,scheduler,nat,igw,egress support
```

Solid arrows show application traffic or task execution. Dotted arrows show DNS, configuration, or the shared outbound network route. Connections to regional AWS services are logical connections; task access to public endpoints uses NAT when Terraform creates the network.

- **Networking:** `create_network = true` creates two public and two private subnets across two Availability Zones, with a single NAT Gateway. Otherwise, Terraform uses supplied VPC, subnet, and ECS security group IDs. Tasks have no public IPs. The diagram groups subnets; it does not imply a task is running in every zone.
- **Availability:** production requests two frontend tasks, two backend tasks, and Multi-AZ RDS. Other environments request one task per service and single-AZ RDS.
- **Ingress:** CloudFront forwards to the public ALB over HTTPS. Existing ACM certificates are supplied for CloudFront in `us-east-1` and the ALB in its region. The ALB security group permits public port 443; it is not restricted to CloudFront. Frontend port 3000 accepts the ALB security group; backend port 4000 accepts the shared ECS security group. RDS port 5432 also accepts that shared ECS security group.
- **Attachments:** the API authorizes access and returns presigned URLs; the browser transfers attachment bytes directly to S3. S3 blocks public access, requires TLS, and retains noncurrent object versions for 90 days under `groups/`.
- **Secrets and roles:** the ECS execution role injects the application database secret, pulls images, and writes logs. Backend and cleanup tasks share a runtime role with scoped attachment access. RDS separately manages its administrator password in Secrets Manager; the application secret is populated outside Terraform.
- **Optional email:** application code supports Amazon SES invitations, but the current Terraform does not provision the SES sender identity, email DNS records, runtime permission, or sender environment setting. SES is therefore omitted from the provisioned-service diagram.

## Deployment and operations

```mermaid
flowchart LR
    github["GitHub Actions<br/>CI checks → deployment"]
    oidc["AWS IAM<br/>GitHub OIDC deployment role"]
    ecr["Amazon ECR<br/>Frontend + backend repositories<br/>Immutable commit-SHA image tags"]
    ecs["Amazon ECS / Fargate<br/>Backend + frontend services<br/>Deployment rollback enabled"]
    cleanup["Fargate cleanup task"]
    scheduler["EventBridge Scheduler<br/>Daily"]
    logs["CloudWatch Logs<br/>Application + cleanup logs<br/>30-day retention"]
    metrics["CloudWatch metrics<br/>ECS Container Insights<br/>ALB + RDS metrics"]
    alarms["CloudWatch alarms<br/>Backend CPU · unhealthy frontend<br/>Database CPU"]
    cleanupAlarm["Cleanup failure alarm<br/>Log metric filter<br/>No notification action configured"]
    sns["Amazon SNS · optional<br/>Email alert subscription"]

    github -->|Assume role with OIDC| oidc
    oidc -. "Authorizes image push and ECS deployment" .-> github
    github -->|Build and push| ecr
    github -->|Register task definitions / update services| ecs
    ecr -->|Pull images| ecs
    ecr -->|Backend image| cleanup
    scheduler -->|RunTask| cleanup
    ecs --> logs
    cleanup --> logs
    ecs --> metrics
    metrics --> alarms
    logs -->|Cleanup failure events| cleanupAlarm
    alarms -->|When alert_email is configured| sns
```

The deployment workflow runs on pushes to `main` or manual dispatch, passes CI, and deploys the backend followed by the frontend. The GitHub IAM role is created when `github_repository` is set. The cleanup task definition and schedule are managed by Terraform; the application deployment workflow does not update the cleanup image.

## Source files

| Area | Source |
| --- | --- |
| VPC, subnets, routing, NAT | [network.tf](terraform/network.tf) |
| Load balancer and ingress | [alb.tf](terraform/alb.tf) |
| CloudFront and DNS | [route53_cloudfront.tf](terraform/route53_cloudfront.tf) |
| Frontend and backend services | [ecs.tf](terraform/ecs.tf) |
| Private backend discovery | [service_discovery.tf](terraform/service_discovery.tf) |
| RDS, S3, Cognito, ECR, secrets | [main.tf](terraform/main.tf) |
| Execution and runtime permissions | [iam.tf](terraform/iam.tf) |
| Scheduled attachment cleanup | [maintenance.tf](terraform/maintenance.tf) |
| Alarms and optional email alerts | [monitoring.tf](terraform/monitoring.tf) |
| GitHub deployment permissions | [deploy.tf](terraform/deploy.tf) |
| Deployment workflow | [deploy.yml](../.github/workflows/deploy.yml) |
