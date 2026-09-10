terraform {
  required_version = ">= 1.10, < 2.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
  # Configure an encrypted S3 backend with locking before sharing state or applying.
}
provider "aws" {
  region = var.aws_region
  default_tags {
    tags = { Application = "expense-book", Environment = var.environment, ManagedBy = "terraform" }
  }
}
