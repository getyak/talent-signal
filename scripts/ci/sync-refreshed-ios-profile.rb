#!/usr/bin/env ruby
# frozen_string_literal: true

require "fileutils"
require "fastlane_core"
require "match"
require "openssl"

APP_IDENTIFIER = "com.talentsignal.app"
PROFILE_NAME = "match AppStore #{APP_IDENTIFIER}"
PROFILE_RELATIVE_PATH = File.join(
  "profiles",
  "appstore",
  "AppStore_#{APP_IDENTIFIER}.mobileprovision"
)

profile_path = File.expand_path(ENV.fetch("REFRESHED_PROFILE_PATH"))
profile = FastlaneCore::ProvisioningProfile.parse(profile_path)
bundle_id = FastlaneCore::ProvisioningProfile.bundle_id(profile_path)
apple_sign_in = profile.fetch("Entitlements", {})["com.apple.developer.applesignin"]

raise "Unexpected profile name: #{profile['Name']}" unless profile["Name"] == PROFILE_NAME
raise "Unexpected bundle identifier: #{bundle_id}" unless bundle_id == APP_IDENTIFIER
raise "Refreshed profile lacks Sign in with Apple" unless apple_sign_in == ["Default"]

params = FastlaneCore::Configuration.create(
  Match::Options.available_options,
  {
    type: "appstore",
    app_identifier: APP_IDENTIFIER,
    git_url: ENV.fetch("MATCH_GIT_URL"),
    git_branch: ENV.fetch("MATCH_GIT_BRANCH", "main"),
    git_full_name: "github-actions[bot]",
    git_user_email: "41898282+github-actions[bot]@users.noreply.github.com",
    storage_mode: "git",
    readonly: false,
    skip_docs: true,
    platform: "ios"
  }
)

storage = nil

begin
  storage = Match::Storage.from_params(params)
  storage.download

  encryption = Match::Encryption.for_storage_mode(
    params[:storage_mode],
    git_url: params[:git_url],
    working_directory: storage.working_directory,
    force_legacy_encryption: params[:force_legacy_encryption]
  )
  encryption.decrypt_files if encryption

  match_certificates = Dir[
    File.join(storage.prefixed_working_directory, "certs", "distribution", "*.cer")
  ]
  raise "Expected exactly one match distribution certificate" unless match_certificates.one?

  profile_certificate_fingerprints = profile.fetch("DeveloperCertificates", []).map do |certificate|
    bytes = certificate.respond_to?(:string) ? certificate.string : certificate.to_s
    OpenSSL::Digest::SHA256.hexdigest(OpenSSL::X509::Certificate.new(bytes).to_der)
  end
  match_certificate_fingerprint = OpenSSL::Digest::SHA256.hexdigest(
    OpenSSL::X509::Certificate.new(File.binread(match_certificates.first)).to_der
  )
  unless profile_certificate_fingerprints.include?(match_certificate_fingerprint)
    raise "Refreshed profile does not contain the isolated match certificate"
  end

  destination = File.join(storage.prefixed_working_directory, PROFILE_RELATIVE_PATH)
  raise "Expected match profile is missing: #{PROFILE_RELATIVE_PATH}" unless File.file?(destination)

  IO.copy_stream(profile_path, destination)
  encryption.encrypt_files if encryption
  storage.save_changes!(
    files_to_commit: [destination],
    custom_message: "Refresh Talent Signal App Store profile"
  )
ensure
  storage.clear_changes if storage
end

puts "Synced refreshed App Store profile with Sign in with Apple"
