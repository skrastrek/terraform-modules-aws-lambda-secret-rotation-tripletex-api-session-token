resource "aws_iam_role" "this" {
  name               = var.name
  assume_role_policy = module.assume_role_policy_document.json

  tags = var.tags
}

module "assume_role_policy_document" {
  source = "github.com/skrastrek/terraform-modules-aws-iam//policy-document/service-assume-role?ref=v0.1.3"

  service_identifiers = ["lambda.amazonaws.com"]
}

resource "aws_iam_role_policy_attachment" "aws_lambda_basic_execution_role" {
  role       = aws_iam_role.this.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

module "tripletex_api_consumer_token_secret_read_role_policy" {
  source = "github.com/skrastrek/terraform-modules-aws-iam//role-policy/secretsmanager-secret-read?ref=v0.1.3"

  role_name   = aws_iam_role.this.name
  policy_name = "tripletex-api-consumer-token-secret-read"

  secret_arn = var.tripletex_api_consumer_token_secret_arn
}

module "tripletex_api_employee_token_secret_read_role_policy" {
  source = "github.com/skrastrek/terraform-modules-aws-iam//role-policy/secretsmanager-secret-read?ref=v0.1.3"

  role_name   = aws_iam_role.this.name
  policy_name = "tripletex-api-employee-token-secret-read"

  secret_arn = var.tripletex_api_employee_token_secret_arn
}

module "tripletex_api_session_token_secret_read_write_role_policy" {
  source = "github.com/skrastrek/terraform-modules-aws-iam//role-policy/secretsmanager-secret-read-write?ref=v0.1.3"

  role_name   = aws_iam_role.this.name
  policy_name = "tripletex-api-session-token-secret-read"

  secret_arn = var.tripletex_api_session_token_secret_arn
}
