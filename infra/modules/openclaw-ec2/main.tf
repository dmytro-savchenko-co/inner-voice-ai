terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
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

# -----------------------------------------------------------------------------
# AMI — Amazon Linux 2023 (latest)
# -----------------------------------------------------------------------------
data "aws_ami" "al2023" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-2023*-x86_64"]
  }

  filter {
    name   = "state"
    values = ["available"]
  }
}

# -----------------------------------------------------------------------------
# Security Group
# -----------------------------------------------------------------------------
resource "aws_security_group" "openclaw" {
  name_prefix = "${local.name_prefix}-openclaw-"
  description = "Security group for OpenClaw EC2 instance"
  vpc_id      = var.vpc_id

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-openclaw"
  })

  lifecycle {
    create_before_destroy = true
  }
}

# SSH from anywhere (dev only — restrict in prod)
resource "aws_vpc_security_group_ingress_rule" "ssh" {
  security_group_id = aws_security_group.openclaw.id
  cidr_ipv4         = "0.0.0.0/0"
  from_port         = 22
  to_port           = 22
  ip_protocol       = "tcp"
  description       = "SSH access (dev only)"
}

# OpenClaw API from ECS tasks
resource "aws_vpc_security_group_ingress_rule" "openclaw_api_from_ecs" {
  security_group_id            = aws_security_group.openclaw.id
  referenced_security_group_id = var.ecs_security_group_id
  from_port                    = 18789
  to_port                      = 18790
  ip_protocol                  = "tcp"
  description                  = "OpenClaw Gateway + Agent Manager from ECS tasks"
}

# All outbound (Telegram API, Anthropic API, Betterness, etc.)
resource "aws_vpc_security_group_egress_rule" "all_outbound" {
  security_group_id = aws_security_group.openclaw.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
  description       = "All outbound traffic"
}

# -----------------------------------------------------------------------------
# IAM Role — Secrets Manager read access
# -----------------------------------------------------------------------------
resource "aws_iam_role" "openclaw" {
  name = "${local.name_prefix}-openclaw-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy" "secrets_read" {
  name = "${local.name_prefix}-openclaw-secrets-read"
  role = aws_iam_role.openclaw.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = values(var.secret_arns)
      },
      {
        Effect = "Allow"
        Action = [
          "bedrock:InvokeModel",
          "bedrock:InvokeModelWithResponseStream",
          "bedrock:ListFoundationModels",
          "bedrock:ListInferenceProfiles",
          "bedrock:GetFoundationModelAvailability"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "aws-marketplace:ViewSubscriptions",
          "aws-marketplace:Subscribe"
        ]
        Resource = "*"
      }
    ]
  })
}

resource "aws_iam_instance_profile" "openclaw" {
  name = "${local.name_prefix}-openclaw-profile"
  role = aws_iam_role.openclaw.name

  tags = local.common_tags
}

# -----------------------------------------------------------------------------
# EC2 Instance
# -----------------------------------------------------------------------------
resource "aws_instance" "openclaw" {
  ami                    = data.aws_ami.al2023.id
  instance_type          = var.instance_type
  key_name               = var.key_name
  subnet_id              = var.subnet_id
  vpc_security_group_ids = [aws_security_group.openclaw.id]
  iam_instance_profile   = aws_iam_instance_profile.openclaw.name

  root_block_device {
    volume_size           = var.ebs_volume_size
    volume_type           = "gp3"
    encrypted             = true
    delete_on_termination = true
  }

  user_data = <<-EOF
    #!/bin/bash
    set -e

    # Install Node.js 24
    dnf install -y nodejs npm git

    # Create openclaw user
    useradd -m -s /bin/bash ocuser

    # Install OpenClaw globally
    npm install -g openclaw

    # Create workspace directory
    sudo -u ocuser mkdir -p /home/ocuser/.openclaw/workspace
    sudo -u ocuser mkdir -p /home/ocuser/.openclaw/agents

    echo "OpenClaw EC2 setup complete" > /tmp/setup-complete.txt
  EOF

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-openclaw"
  })
}
