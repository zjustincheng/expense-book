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
  description = "VPC containing application and database private subnets."
}
variable "private_subnet_ids" {
  type        = list(string)
  description = "At least two private subnets in distinct availability zones."
  validation {
    condition     = length(var.private_subnet_ids) >= 2
    error_message = "Provide at least two private subnets."
  }
}
variable "application_security_group_id" {
  type        = string
  description = "Security group used by the backend ECS tasks."
}
