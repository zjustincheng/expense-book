resource "aws_vpc" "application" {
  count                = var.create_network ? 1 : 0
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags                 = { Name = local.name }
}
data "aws_availability_zones" "available" {
  state = "available"
  # Exclude Local Zones and Wavelength Zones. NAT Gateway and RDS subnet
  # groups require standard regional Availability Zones.
  filter {
    name   = "opt-in-status"
    values = ["opt-in-not-required"]
  }
  filter {
    name   = "zone-type"
    values = ["availability-zone"]
  }
}
resource "aws_internet_gateway" "application" {
  count  = var.create_network ? 1 : 0
  vpc_id = aws_vpc.application[0].id
}
resource "aws_subnet" "public" {
  count                   = var.create_network ? 2 : 0
  vpc_id                  = aws_vpc.application[0].id
  availability_zone       = data.aws_availability_zones.available.names[count.index]
  cidr_block              = cidrsubnet(var.vpc_cidr, 4, count.index)
  map_public_ip_on_launch = true
  tags                    = { Name = "${local.name}-public-${count.index + 1}" }
}
resource "aws_subnet" "private" {
  count             = var.create_network ? 2 : 0
  vpc_id            = aws_vpc.application[0].id
  availability_zone = data.aws_availability_zones.available.names[count.index]
  cidr_block        = cidrsubnet(var.vpc_cidr, 4, count.index + 8)
  tags              = { Name = "${local.name}-private-${count.index + 1}" }
}
resource "aws_eip" "nat" {
  count  = var.create_network ? 1 : 0
  domain = "vpc"
}
resource "aws_nat_gateway" "application" {
  count         = var.create_network ? 1 : 0
  allocation_id = aws_eip.nat[0].id
  subnet_id     = aws_subnet.public[0].id
  depends_on    = [aws_internet_gateway.application]
}
resource "aws_route_table" "public" {
  count  = var.create_network ? 1 : 0
  vpc_id = aws_vpc.application[0].id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.application[0].id
  }
}
resource "aws_route_table_association" "public" {
  count          = var.create_network ? 2 : 0
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public[0].id
}
resource "aws_route_table" "private" {
  count  = var.create_network ? 1 : 0
  vpc_id = aws_vpc.application[0].id
  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.application[0].id
  }
}
resource "aws_route_table_association" "private" {
  count          = var.create_network ? 2 : 0
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private[0].id
}
resource "aws_security_group" "ecs" {
  count       = var.create_network ? 1 : 0
  name_prefix = "${local.name}-ecs-"
  description = "ECS service-to-service traffic"
  vpc_id      = aws_vpc.application[0].id
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}
locals {
  network_vpc_id      = var.create_network ? aws_vpc.application[0].id : var.vpc_id
  network_public_ids  = var.create_network ? aws_subnet.public[*].id : var.public_subnet_ids
  network_private_ids = var.create_network ? aws_subnet.private[*].id : var.private_subnet_ids
  network_ecs_sg_id   = var.create_network ? aws_security_group.ecs[0].id : var.ecs_security_group_id
  network_database_sg = var.create_network ? aws_security_group.ecs[0].id : var.application_security_group_id
}
