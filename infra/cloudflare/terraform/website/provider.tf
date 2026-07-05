terraform {
  required_version = ">= 1.11.0" # use_lockfile (native S3 state locking) is GA in 1.11

  required_providers {
    cloudflare = {
      source = "cloudflare/cloudflare"
      # v5 is a generated-from-OpenAPI rewrite of the provider; resource and
      # attribute names differ substantially from v4. This root targets the v5
      # schema (cloudflare_r2_bucket, cloudflare_r2_custom_domain,
      # cloudflare_dns_record). Pin to the v5 major.
      version = "~> 5.21"
    }
  }
}

# Authenticated via the CLOUDFLARE_API_TOKEN environment variable (a scoped API
# token) so the token never lands in state or plan output. account_id is passed
# per-resource from var.cloudflare_account_id.
provider "cloudflare" {}
