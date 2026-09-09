variable "aws_region" {
  type        = string
  description = "AWS deployment region; choose before deployment."
}
variable "environment" {
  type    = string
  default = "development"
  validation {
    condition     = contains(["development", "staging", "production"], var.environment)
    error_message = "Use development, staging, or production."
  }
}
variable "name_prefix" {
  type        = string
  description = "Globally unique lowercase prefix for S3 and Cognito domain names."
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,24}$", var.name_prefix))
    error_message = "Use 3–25 lowercase letters, numbers, or hyphens, starting with a letter."
  }
}
variable "app_url" {
  type        = string
  description = "HTTPS website origin for Cognito callbacks."
  validation {
    condition     = can(regex("^https://[^/]+$", var.app_url))
    error_message = "Use an HTTPS origin without a trailing slash."
  }
}
variable "vpc_id" {
  type        = string
  default     = null
  description = "VPC containing application and database private subnets."
}
variable "private_subnet_ids" {
  type        = list(string)
  default     = []
  description = "At least two private subnets in distinct availability zones."
  validation {
    condition     = var.create_network || length(var.private_subnet_ids) >= 2
    error_message = "Provide at least two private subnets."
  }
}
variable "application_security_group_id" {
  type        = string
  default     = null
  description = "Security group used by the backend ECS tasks."
}
variable "public_subnet_ids" {
  type        = list(string)
  default     = []
  description = "At least two public subnets for the internet-facing load balancer."
  validation {
    condition     = var.create_network || length(var.public_subnet_ids) >= 2
    error_message = "Provide at least two public subnets."
  }
}
variable "certificate_arn" {
  type        = string
  description = "ACM certificate ARN covering the application domain."
}
variable "app_domain" {
  type        = string
  description = "Public application hostname, without a scheme (for example app.example.com)."
  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9.-]+[a-z0-9]$", var.app_domain))
    error_message = "Provide a valid lowercase DNS hostname."
  }
}
variable "hosted_zone_id" {
  type        = string
  description = "Route 53 hosted zone ID that contains app_domain."
}
variable "cloudfront_certificate_arn" {
  type        = string
  description = "ACM certificate ARN in us-east-1 covering app_domain for CloudFront."
}
variable "create_network" {
  type        = bool
  default     = false
  description = "Create a two-AZ VPC, subnets, NAT gateway, and ECS security group when true."
}
variable "vpc_cidr" {
  type        = string
  default     = "10.42.0.0/16"
  description = "CIDR block for the managed VPC."
}
