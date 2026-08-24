# frozen_string_literal: true

require "json"
require "net/http"
require "spaceship"
require "uri"

APP_IDENTIFIER = "com.talentsignal.app"
DEFAULT_INTERNAL_GROUP = "Talent Signal Internal"

class AppStoreConnectClient
  API_BASE = "https://api.appstoreconnect.apple.com"

  def initialize
    @token = Spaceship::ConnectAPI::Token.create(
      key_id: ENV.fetch("APP_STORE_CONNECT_API_KEY_ID"),
      issuer_id: ENV.fetch("APP_STORE_CONNECT_ISSUER_ID"),
      filepath: ENV.fetch("APP_STORE_CONNECT_API_KEY_PATH"),
      duration: 1_200,
      in_house: false
    )
  end

  def get(endpoint, query: {}, optional: false)
    request(:get, endpoint, query: query, optional: optional)
  end

  def post(endpoint, body:)
    request(:post, endpoint, body: body)
  end

  private

  def request(method, endpoint, query: {}, body: nil, optional: false)
    uri = URI("#{API_BASE}#{endpoint}")
    uri.query = URI.encode_www_form(query) unless query.empty?

    request_class = method == :post ? Net::HTTP::Post : Net::HTTP::Get
    http_request = request_class.new(uri)
    http_request["Authorization"] = "Bearer #{@token.text}"
    http_request["Accept"] = "application/json"
    if body
      http_request["Content-Type"] = "application/json"
      http_request.body = JSON.generate(body)
    end

    response = Net::HTTP.start(
      uri.hostname,
      uri.port,
      use_ssl: true,
      open_timeout: 15,
      read_timeout: 45
    ) { |http| http.request(http_request) }

    status = response.code.to_i
    return {} if status == 204
    return JSON.parse(response.body) if status.between?(200, 299)
    return nil if optional && [403, 404].include?(status)

    raise "App Store Connect #{method.to_s.upcase} #{uri.path} failed with HTTP #{status}"
  end
end

def relationship_ids(resource, name)
  resource.dig("relationships", name, "data")&.map { |item| item.fetch("id") } || []
end

def included_index(document, type)
  (document["included"] || [])
    .select { |item| item["type"] == type }
    .to_h { |item| [item.fetch("id"), item] }
end

def boolean_env(name)
  ENV.fetch(name, "false").casecmp("true").zero?
end

def append_summary(lines)
  summary_path = ENV["GITHUB_STEP_SUMMARY"]
  return unless summary_path

  File.open(summary_path, "a") do |file|
    file.puts("### TestFlight access audit")
    file.puts
    lines.each { |line| file.puts("- #{line}") }
  end
end

client = AppStoreConnectClient.new
tester_email = ENV.fetch("TESTFLIGHT_TESTER_EMAIL").strip
target_group_name = ENV.fetch("TESTFLIGHT_TARGET_GROUP", DEFAULT_INTERNAL_GROUP)
repair_access = boolean_env("TESTFLIGHT_REPAIR_ACCESS")
resend_invitation = boolean_env("TESTFLIGHT_RESEND_INVITATION")

apps = client.get(
  "/v1/apps",
  query: {
    "filter[bundleId]" => APP_IDENTIFIER,
    "fields[apps]" => "name,bundleId",
    "limit" => "10"
  }
).fetch("data")
raise "Talent Signal app was not found in App Store Connect" unless apps.one?

app = apps.first
app_id = app.fetch("id")

tester_document = client.get(
  "/v1/betaTesters",
  query: {
    "filter[email]" => tester_email,
    "filter[apps]" => app_id,
    "fields[betaTesters]" => "firstName,lastName,email,inviteType,state,appDevices,apps,betaGroups,builds",
    "include" => "apps,betaGroups,builds",
    "limit" => "10"
  }
)
testers = tester_document.fetch("data")
tester = testers.find { |item| item.dig("attributes", "email")&.casecmp?(tester_email) }
raise "The configured tester was not found for Talent Signal" unless tester

tester_id = tester.fetch("id")
state_before = tester.dig("attributes", "state") || "UNKNOWN"
invite_type = tester.dig("attributes", "inviteType") || "UNKNOWN"
device_count = Array(tester.dig("attributes", "appDevices")).length

groups_document = client.get(
  "/v1/betaGroups",
  query: {
    "filter[app]" => app_id,
    "fields[betaGroups]" => "name,isInternalGroup,hasAccessToAllBuilds,app,builds,betaTesters",
    "limit" => "200"
  }
)
groups = groups_document.fetch("data")
target_group = groups.find do |group|
  group.dig("attributes", "name") == target_group_name &&
    group.dig("attributes", "isInternalGroup") == true
end
raise "The configured internal TestFlight group was not found" unless target_group

group_id = target_group.fetch("id")
has_access_to_all_builds = target_group.dig("attributes", "hasAccessToAllBuilds") == true

group_testers = client.get(
  "/v1/betaGroups/#{group_id}/betaTesters",
  query: {
    "fields[betaTesters]" => "state",
    "limit" => "200"
  }
).fetch("data")
member_before = group_testers.any? { |item| item.fetch("id") == tester_id }
membership_repaired = false

if repair_access && !member_before
  client.post(
    "/v1/betaGroups/#{group_id}/relationships/betaTesters",
    body: { data: [{ type: "betaTesters", id: tester_id }] }
  )
  membership_repaired = true
end

group_builds = client.get(
  "/v1/builds",
  query: {
    "filter[app]" => app_id,
    "filter[betaGroups]" => group_id,
    "fields[builds]" => "version,uploadedDate,expirationDate,expired,processingState,preReleaseVersion,buildBetaDetail",
    "fields[preReleaseVersions]" => "version,platform",
    "include" => "preReleaseVersion,buildBetaDetail",
    "sort" => "-uploadedDate",
    "limit" => "200"
  }
)

builds = group_builds.fetch("data")
build_access_repaired = false

if builds.empty? && repair_access && !has_access_to_all_builds
  app_builds = client.get(
    "/v1/builds",
    query: {
      "filter[app]" => app_id,
      "filter[processingState]" => "VALID",
      "fields[builds]" => "version,uploadedDate,expirationDate,expired,processingState,preReleaseVersion",
      "fields[preReleaseVersions]" => "version,platform",
      "include" => "preReleaseVersion",
      "sort" => "-uploadedDate",
      "limit" => "10"
    }
  )
  latest_app_build = app_builds.fetch("data").first
  raise "No valid Talent Signal TestFlight build was found" unless latest_app_build

  client.post(
    "/v1/betaGroups/#{group_id}/relationships/builds",
    body: { data: [{ type: "builds", id: latest_app_build.fetch("id") }] }
  )
  build_access_repaired = true
  group_builds = client.get(
    "/v1/builds",
    query: {
      "filter[app]" => app_id,
      "filter[betaGroups]" => group_id,
      "fields[builds]" => "version,uploadedDate,expirationDate,expired,processingState,preReleaseVersion,buildBetaDetail",
      "fields[preReleaseVersions]" => "version,platform",
      "include" => "preReleaseVersion,buildBetaDetail",
      "sort" => "-uploadedDate",
      "limit" => "200"
    }
  )
  builds = group_builds.fetch("data")
end

latest_build = builds.first
pre_release_versions = included_index(group_builds, "preReleaseVersions")
pre_release_id = latest_build&.dig("relationships", "preReleaseVersion", "data", "id")
marketing_version = pre_release_versions.dig(pre_release_id, "attributes", "version") || "UNKNOWN"
build_number = latest_build&.dig("attributes", "version") || "NONE"
processing_state = latest_build&.dig("attributes", "processingState") || "UNKNOWN"
build_expired = latest_build&.dig("attributes", "expired") == true

active_users = client.get(
  "/v1/users",
  query: {
    "filter[username]" => tester_email,
    "fields[users]" => "username,roles,allAppsVisible,visibleApps",
    "limit" => "10"
  },
  optional: true
)
pending_user_invitations = client.get(
  "/v1/userInvitations",
  query: {
    "filter[email]" => tester_email,
    "fields[userInvitations]" => "email,expirationDate,roles,allAppsVisible,visibleApps",
    "limit" => "10"
  },
  optional: true
)

invitation_resent = false
if resend_invitation && ["INVITED", "NOT_INVITED", "REVOKED"].include?(state_before)
  client.post(
    "/v1/betaTesterInvitations",
    body: {
      data: {
        type: "betaTesterInvitations",
        relationships: {
          app: { data: { type: "apps", id: app_id } },
          betaTester: { data: { type: "betaTesters", id: tester_id } }
        }
      }
    }
  )
  invitation_resent = true
end

member_after = member_before || membership_repaired
active_user_status = active_users.nil? ? "UNAVAILABLE" : active_users.fetch("data").empty? ? "MISSING" : "ACTIVE"
pending_user_invitation = pending_user_invitations.nil? ? "UNAVAILABLE" : pending_user_invitations.fetch("data").empty? ? "NO" : "YES"
server_access_ready = member_after && latest_build && processing_state == "VALID" && !build_expired

diagnosis = if pending_user_invitation == "YES"
              "APP_STORE_CONNECT_USER_INVITATION_PENDING"
            elsif active_user_status == "MISSING"
              "APP_STORE_CONNECT_USER_NOT_ACTIVE"
            elsif !member_after
              "TESTER_NOT_IN_INTERNAL_GROUP"
            elsif latest_build.nil?
              "INTERNAL_GROUP_HAS_NO_BUILD"
            elsif build_expired
              "LATEST_BUILD_EXPIRED"
            elsif processing_state != "VALID"
              "LATEST_BUILD_NOT_VALID"
            elsif state_before == "INVITED"
              "TESTFLIGHT_INVITATION_NOT_ACCEPTED"
            elsif state_before == "ACCEPTED"
              "INVITATION_ACCEPTED_BUT_BUILD_NOT_INSTALLED"
            else
              "SERVER_ACCESS_READY"
            end

summary = [
  "Tester state: `#{state_before}`",
  "Invite type: `#{invite_type}`",
  "Active App Store Connect user: `#{active_user_status}`",
  "Pending App Store Connect user invitation: `#{pending_user_invitation}`",
  "Internal group membership: `#{member_after}`",
  "Internal group covers all builds: `#{has_access_to_all_builds}`",
  "Latest accessible version/build: `#{marketing_version}` / `#{build_number}`",
  "Build processing state: `#{processing_state}`",
  "Known TestFlight devices: `#{device_count}`",
  "Membership repaired: `#{membership_repaired}`",
  "Build access repaired: `#{build_access_repaired}`",
  "Invitation resent: `#{invitation_resent}`",
  "Server access ready: `#{server_access_ready}`",
  "Diagnosis: `#{diagnosis}`"
]
append_summary(summary)

puts "TESTER_STATE=#{state_before}"
puts "ACTIVE_USER_STATUS=#{active_user_status}"
puts "PENDING_USER_INVITATION=#{pending_user_invitation}"
puts "GROUP_MEMBER=#{member_after}"
puts "GROUP_ALL_BUILDS=#{has_access_to_all_builds}"
puts "LATEST_VERSION=#{marketing_version}"
puts "LATEST_BUILD=#{build_number}"
puts "BUILD_STATE=#{processing_state}"
puts "DEVICE_COUNT=#{device_count}"
puts "MEMBERSHIP_REPAIRED=#{membership_repaired}"
puts "BUILD_ACCESS_REPAIRED=#{build_access_repaired}"
puts "INVITATION_RESENT=#{invitation_resent}"
puts "SERVER_ACCESS_READY=#{server_access_ready}"
puts "DIAGNOSIS=#{diagnosis}"
