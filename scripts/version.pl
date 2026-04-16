#!/usr/bin/perl
# -----------------------------------------------------------------------------
#  scripts/version.pl
#    Prints the full release version in the form MAJOR.MINOR.PATCH.BUILD, where
#    MAJOR.MINOR.PATCH comes from the repo's VERSION file and BUILD is the
#    number of git commits reachable from HEAD. Used by .github/workflows/
#    release.yml to stamp release artifacts.
#
#  Usage:
#    perl scripts/version.pl              # prints "1.0.0.123"
#    perl scripts/version.pl --base       # prints "1.0.0"
#    perl scripts/version.pl --build      # prints "123"
# -----------------------------------------------------------------------------
use strict;
use warnings;
use FindBin;

my $mode = $ARGV[0] || '';

my $version_file = "$FindBin::Bin/../VERSION";
die "VERSION file not found at $version_file\n" unless -r $version_file;

open my $fh, '<', $version_file or die "cannot read $version_file: $!";
chomp(my $base = <$fh>);
close $fh;

$base =~ s/^\s+|\s+$//g;
die "empty VERSION file\n" unless length $base;

# Normalize base to MAJOR.MINOR.PATCH (pad zeros if shorter)
my @parts = split /\./, $base;
push @parts, '0' while @parts < 3;
$base = join('.', @parts[0..2]);

if ($mode eq '--base') {
    print "$base\n";
    exit 0;
}

# Build = number of commits reachable from HEAD
my $build;
{
    local $ENV{LC_ALL} = 'C';
    $build = `git rev-list --count HEAD 2>/dev/null`;
    chomp $build;
    $build = '0' if !$build || $build !~ /^\d+$/;
}

if ($mode eq '--build') {
    print "$build\n";
    exit 0;
}

print "$base.$build\n";
