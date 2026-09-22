const releasePaths = /^(apps\/macos\/|brand\/|scripts\/macos\/|scripts\/check-brand-assets\.mjs$|docs\/operations\/macos-|\.github\/workflows\/release-macos\.yml$)/;

function trustedCI(run, repository, sha) {
  return run?.event === 'push' && run?.conclusion === 'success' &&
    run?.head_branch === 'main' && run?.head_sha === sha &&
    run?.head_repository?.full_name === repository;
}

function changedReleaseFiles(files) {
  return files.some(file => releasePaths.test(file.filename) ||
    (file.previous_filename && releasePaths.test(file.previous_filename)));
}

async function decide({ github, context, core }) {
  const { owner, repo } = context.repo;
  const branch = await github.rest.repos.getBranch({ owner, repo, branch: 'main' });
  const sha = branch.data.commit.sha;
  core.setOutput('sha', sha);
  core.setOutput('release', 'false');
  const fullName = `${owner}/${repo}`;
  if (context.eventName === 'workflow_run') {
    if (!trustedCI(context.payload.workflow_run, fullName, sha)) {
      core.notice('Only successful push CI for the current trusted main revision can publish.');
      return;
    }
  } else {
    if (context.ref !== 'refs/heads/main' || context.sha !== sha) {
      throw new Error('Manual release must run from the current main revision.');
    }
    const runs = await github.rest.actions.listWorkflowRuns({ owner, repo,
      workflow_id: 'ci.yml', head_sha: sha, event: 'push', status: 'success', per_page: 100 });
    if (!runs.data.workflow_runs.some(run => trustedCI(run, fullName, sha))) {
      throw new Error('Successful push CI for this exact revision is required.');
    }
  }
  const releases = await github.paginate(github.rest.repos.listReleases, { owner, repo, per_page: 100 });
  const latest = releases.filter(r => !r.draft && /^macos-\d+-\d+$/.test(r.tag_name))
    .sort((a, b) => new Date(b.published_at) - new Date(a.published_at))[0];
  if (context.eventName !== 'workflow_dispatch' && latest) {
    const comparison = await github.rest.repos.compareCommitsWithBasehead({ owner, repo,
      basehead: `${latest.tag_name}...${sha}` });
    // A comparison may cap file details. Fall through conservatively when capped.
    const files = comparison.data.files || [];
    if (files.length < 300 && !changedReleaseFiles(files)) {
      core.notice('No native macOS release inputs changed.');
      return;
    }
  }
  core.setOutput('release', 'true');
}
module.exports = { trustedCI, changedReleaseFiles, decide };
