output "bucket_id" {
  description = "The name of the S3 bucket"
  value       = aws_s3_bucket.media.id
}

output "bucket_arn" {
  description = "The ARN of the S3 bucket"
  value       = aws_s3_bucket.media.arn
}

output "bucket_domain_name" {
  description = "The bucket domain name"
  value       = aws_s3_bucket.media.bucket_domain_name
}
