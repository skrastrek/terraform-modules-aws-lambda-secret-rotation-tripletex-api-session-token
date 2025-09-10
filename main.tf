locals {
  resources_path                  = "${path.module}/resources"
  resources_src_hash              = sha256(join("", [for f in fileset(local.resources_path, "src/**") : filesha256(f)]))
  resources_npm_package_hash      = filesha256("${local.resources_path}/package.json")
  resources_npm_package_lock_hash = filesha256("${local.resources_path}/package-lock.json")

  resources_content_hash = sha256(join("", [
    local.resources_src_hash, local.resources_npm_package_hash, local.resources_npm_package_lock_hash
  ]))
}

data "external" "npm_build" {
  program = [
    "sh", "-c", <<EOT
(npm ci && npm run build) >&2 && echo "{\"filename\": \"index.js\"}"
EOT
  ]
  working_dir = local.resources_path
}

data "archive_file" "zip" {
  type             = "zip"
  source_file      = "${local.resources_path}/dist/${data.external.npm_build.result.filename}"
  output_path      = "${local.resources_path}/lambda-${local.resources_content_hash}.zip"
  output_file_mode = "0666"
}

resource "aws_lambda_function" "this" {
  function_name = var.name
  description   = var.description

  role = aws_iam_role.this.arn

  publish = true

  runtime       = "nodejs22.x"
  architectures = ["arm64"]

  memory_size = var.memory_size

  handler = "index.handler"

  package_type     = title(data.archive_file.zip.type)
  filename         = data.archive_file.zip.output_path
  source_code_hash = data.archive_file.zip.output_base64sha256

  logging_config {
    log_format            = var.logging_config.log_format
    application_log_level = var.logging_config.application_log_level
    system_log_level      = var.logging_config.system_log_level
  }

  environment {
    variables = {
      TRIPLETEX_API_BASE_URL                       = var.tripletex_api_base_url
      TRIPLETEX_API_COMPANY_ID                     = var.tripletex_api_company_id
      TRIPLETEX_API_CONSUMER_TOKEN_SECRET_ARN      = var.tripletex_api_consumer_token_secret_arn
      TRIPLETEX_API_EMPLOYEE_TOKEN_SECRET_ARN      = var.tripletex_api_employee_token_secret_arn
      TRIPLETEX_API_SESSION_TOKEN_DURATION_IN_DAYS = var.tripletex_api_session_token_duration_in_days
    }
  }
}

resource "aws_cloudwatch_log_group" "this" {
  name              = "/aws/lambda/${var.name}"
  retention_in_days = var.cloudwatch_log_group_retention_in_days
  kms_key_id        = var.cloudwatch_log_group_kms_key_id

  tags = var.tags
}

resource "aws_lambda_permission" "invoke_from_secrets_manager" {
  function_name = aws_lambda_function.this.function_name

  statement_id = "InvokeFromSecretsManager"
  action       = "lambda:InvokeFunction"
  principal    = "secretsmanager.amazonaws.com"
  source_arn   = var.tripletex_api_session_token_secret_arn
}
