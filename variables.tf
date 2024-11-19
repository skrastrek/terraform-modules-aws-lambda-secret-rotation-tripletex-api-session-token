variable "name" {
  type = string
}

variable "description" {
  type    = string
  default = null
}

variable "cloudwatch_log_group_retention_in_days" {
  type = number
}

variable "cloudwatch_log_group_kms_key_id" {
  type    = string
  default = null
}

variable "logging_config" {
  type = object({
    log_format            = optional(string, "JSON")
    application_log_level = optional(string, "INFO")
    system_log_level      = optional(string, "WARN")
  })
  default = {
    log_format            = "JSON"
    application_log_level = "INFO"
    system_log_level      = "WARN"
  }
}

variable "memory_size" {
  type = number
}

variable "tripletex_api_base_url" {
  type = string
}

variable "tripletex_api_company_id" {
  type = string
}

variable "tripletex_api_consumer_token_secret_arn" {
  type = string
}

variable "tripletex_api_employee_token_secret_arn" {
  type = string
}

variable "tripletex_api_session_token_secret_arn" {
  type = string
}

variable "tripletex_api_session_token_duration_in_days" {
  type = number
}

variable "tags" {
  type = map(string)
}
