terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
}

locals {
  name_prefix = "${var.project_name}-${var.environment}"
  common_tags = merge(var.tags, {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "opentofu"
  })
}

# Generate a random password for the DB master user
resource "random_password" "db_password" {
  length  = 32
  special = false # Avoid special chars that cause connection string issues
}

# DB subnet group (use provided subnets or fall back to default VPC)
resource "aws_db_subnet_group" "main" {
  count      = length(var.subnet_ids) > 0 ? 1 : 0
  name       = "${local.name_prefix}-db-subnet"
  subnet_ids = var.subnet_ids

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-db-subnet"
  })
}

# Security group for RDS
resource "aws_security_group" "rds" {
  name_prefix = "${local.name_prefix}-rds-"
  description = "Security group for ${local.name_prefix} RDS PostgreSQL"
  vpc_id      = var.vpc_id != "" ? var.vpc_id : null

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-rds"
  })

  lifecycle {
    create_before_destroy = true
  }
}

# Allow inbound PostgreSQL from specified security groups
resource "aws_vpc_security_group_ingress_rule" "from_sg" {
  for_each = toset(var.allowed_security_group_ids)

  security_group_id            = aws_security_group.rds.id
  referenced_security_group_id = each.value
  from_port                    = 5432
  to_port                      = 5432
  ip_protocol                  = "tcp"
  description                  = "PostgreSQL from allowed SG"
}

# Allow inbound PostgreSQL from specified CIDR blocks
resource "aws_vpc_security_group_ingress_rule" "from_cidr" {
  for_each = toset(var.allowed_cidr_blocks)

  security_group_id = aws_security_group.rds.id
  cidr_ipv4         = each.value
  from_port         = 5432
  to_port           = 5432
  ip_protocol       = "tcp"
  description       = "PostgreSQL from allowed CIDR"
}

# Allow all outbound (default)
resource "aws_vpc_security_group_egress_rule" "all" {
  security_group_id = aws_security_group.rds.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
  description       = "Allow all outbound"
}

# RDS PostgreSQL instance
resource "aws_db_instance" "main" {
  identifier = "${local.name_prefix}-postgres"

  engine         = "postgres"
  engine_version = "16.13"
  instance_class = var.instance_class

  allocated_storage     = var.allocated_storage
  max_allocated_storage = var.allocated_storage * 2
  storage_type          = "gp3"
  storage_encrypted     = true

  db_name  = var.db_name
  username = var.db_username
  password = random_password.db_password.result

  db_subnet_group_name   = length(var.subnet_ids) > 0 ? aws_db_subnet_group.main[0].name : null
  vpc_security_group_ids = [aws_security_group.rds.id]

  multi_az            = var.multi_az
  publicly_accessible = var.publicly_accessible

  backup_retention_period = var.backup_retention_period
  backup_window           = "03:00-04:00"
  maintenance_window      = "Mon:04:00-Mon:05:00"

  deletion_protection       = var.deletion_protection
  skip_final_snapshot       = var.environment == "dev"
  final_snapshot_identifier = var.environment == "dev" ? null : "${local.name_prefix}-final-snapshot"

  performance_insights_enabled = var.instance_class != "db.t4g.micro" # Not available on micro

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-postgres"
  })

  lifecycle {
    prevent_destroy = true
  }
}

# Store the database URL in Secrets Manager
resource "aws_secretsmanager_secret" "db_url" {
  name                    = "${local.name_prefix}/database-url"
  description             = "PostgreSQL connection URL for ${local.name_prefix}"
  recovery_window_in_days = var.environment == "dev" ? 0 : 30

  tags = local.common_tags
}

resource "aws_secretsmanager_secret_version" "db_url" {
  secret_id = aws_secretsmanager_secret.db_url.id
  secret_string = jsonencode({
    url      = "postgresql://${var.db_username}:${random_password.db_password.result}@${aws_db_instance.main.endpoint}/${var.db_name}"
    host     = aws_db_instance.main.address
    port     = aws_db_instance.main.port
    database = var.db_name
    username = var.db_username
    password = random_password.db_password.result
  })
}
