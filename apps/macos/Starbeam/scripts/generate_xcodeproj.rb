#!/usr/bin/env ruby

# Generates a minimal macOS SwiftUI menu bar app Xcode project.
# Run from repo root: ruby apps/macos/Starbeam/scripts/generate_xcodeproj.rb

require 'fileutils'

# Ensure we use the Homebrew CocoaPods bundled gems when available.
ENV['GEM_HOME'] ||= '/opt/homebrew/Cellar/cocoapods/1.16.2_2/libexec'
ENV['GEM_PATH'] ||= ENV['GEM_HOME']

require 'rubygems'
Gem.clear_paths

require 'xcodeproj'

# This script lives at: apps/macos/Starbeam/scripts/
# Repo root is 4 levels up from here.
ROOT = File.expand_path('../../../..', __dir__)
PROJECT_DIR = File.join(ROOT, 'apps', 'macos', 'Starbeam')
SRC_DIR = File.join(PROJECT_DIR, 'Starbeam')
PROJECT_PATH = File.join(PROJECT_DIR, 'Starbeam.xcodeproj')

FileUtils.rm_rf(PROJECT_PATH)

project = Xcodeproj::Project.new(PROJECT_PATH)

# Groups
starbeam_group = project.main_group.new_group('Starbeam', 'Starbeam')

# Target
app_target = project.new_target(:application, 'Starbeam', :osx, '14.0')

# Files
sources = Dir.glob(File.join(SRC_DIR, '**', '*.swift')).sort
sources_refs = sources.map do |abs|
  rel = abs.sub(PROJECT_DIR + '/', '')
  starbeam_group.new_file(rel.sub('Starbeam/', ''))
end

plist_ref = starbeam_group.new_file('Info.plist')
entitlements_path = File.join(SRC_DIR, 'Starbeam.entitlements')
entitlements_ref = nil
if File.exist?(entitlements_path)
  entitlements_ref = starbeam_group.new_file('Starbeam.entitlements')
end

app_target.add_file_references(sources_refs)

# Build settings
app_target.build_configurations.each do |config|
  config.build_settings['PRODUCT_BUNDLE_IDENTIFIER'] = 'com.starbeam.macos'
  config.build_settings['INFOPLIST_FILE'] = 'Starbeam/Info.plist'
  config.build_settings['MACOSX_DEPLOYMENT_TARGET'] = '14.0'
  config.build_settings['CURRENT_PROJECT_VERSION'] = '1'
  config.build_settings['MARKETING_VERSION'] = '0.1.0'

  # Let contributors build without needing to select a signing team.
  config.build_settings['CODE_SIGNING_ALLOWED'] = 'NO'
  config.build_settings['CODE_SIGNING_REQUIRED'] = 'NO'

  if entitlements_ref
    config.build_settings['CODE_SIGN_ENTITLEMENTS'] = 'Starbeam/Starbeam.entitlements'
  end
end

project.save

puts "Generated #{PROJECT_PATH}"
