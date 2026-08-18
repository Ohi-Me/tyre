# Terraform remote state backend.
#
# Remote state is REQUIRED for any team / prod environment — local terraform.tfstate
# must never hold production secrets or resource graphs. Uncomment the block below
# AFTER creating the S3 bucket (`tyre-terraform-state`) and DynamoDB table
# (`tyre-terraform-locks`) used for state locking.
#
# Bootstrap (one-time, run with `terraform init -backend=false` while the block
# below stays commented):
#
#   aws s3api create-bucket \
#     --bucket tyre-terraform-state \
#     --region ap-south-1 \
#     --create-bucket-configuration LocationConstraint=ap-south-1
#   aws s3api put-bucket-versioning \
#     --bucket tyre-terraform-state \
#     --versioning-configuration Status=Enabled
#   aws s3api put-bucket-encryption \
#     --bucket tyre-terraform-state \
#     --server-side-encryption-configuration \
#       '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
#   aws s3api put-public-access-block \
#     --bucket tyre-terraform-state \
#     --public-access-block-configuration \
#       BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
#
#   aws dynamodb create-table \
#     --table-name tyre-terraform-locks \
#     --attribute-definitions AttributeName=LockID,AttributeType=S \
#     --key-schema AttributeName=LockID,KeyType=HASH \
#     --billing-mode PAY_PER_REQUEST \
#     --region ap-south-1
#
# Then uncomment the block below and run `terraform init` to migrate state.

# terraform {
#   backend "s3" {
#     bucket         = "tyre-terraform-state"
#     key            = "tyre/prod/terraform.tfstate"
#     region         = "ap-south-1"
#     encrypt        = true
#     dynamodb_table = "tyre-terraform-locks"
#   }
# }
