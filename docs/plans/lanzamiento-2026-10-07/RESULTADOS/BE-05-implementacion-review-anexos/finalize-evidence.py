from pathlib import Path
import datetime, hashlib, json, re, subprocess

root = Path(__file__).resolve().parents[5]
annex = Path(__file__).resolve().parent
results = annex.parent
report = results / 'BE-05-implementacion-review.md'

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

sources = json.loads((annex / 'sources-final.json').read_text())
assert all(digest(root / name) == value for name, value in sources.items())
received = json.loads((annex / 'received-sha256.json').read_text())
assert all(digest(annex / 'received' / name) == value for name, value in received.items())
ownership = json.loads((annex / 'ownership.json').read_text())
assert ownership['liveResources'] == [] and ownership['cloneDropped']
assert ownership['connectionsBeforeDrop'] == 0 and ownership['sharedBoundedCountsAndIDsUnchanged']
check = subprocess.run(['git', 'diff', '--check'], cwd=root, capture_output=True, text=True)
assert check.returncode == 0
executions = {path.name.removesuffix('-result.json'): json.loads(path.read_text())
              for path in annex.glob('*-result.json')}
required = ['migrate', 'prisma-generate', 'recovery-final', 'monotonic-final',
            'aliases-corrected', 'transport-after-final', 'session-loopback-final',
            'lint-delivery-final', 'lint-session-final', 'schema-final', 'stop-final']
assert all(executions[name]['exitCode'] == 0 for name in required)
assert executions['types-delivery-final']['exitCode'] == 2
runtime = {path.name: json.loads(path.read_text()) for path in annex.glob('*-runtime.json')}
assert all(value['stopped'] and not value['serverListening'] and
           value['drain'] == {'pendingJobs': 0, 'tickets': 0, 'quarantined': False, 'deadlineExceeded': False}
           for value in runtime.values())
artifact_hashes = {str(path.relative_to(root)): digest(path) for path in annex.iterdir() if path.is_file()}
artifact_hashes[str(report.relative_to(root))] = digest(report)
evidence = {
    'generatedAtUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'owner': '/root/be05_account_draft_review_sol', 'runId': ownership['runId'],
    'model': 'Sol6.1 HIGH', 'scope': 'BE-05 serial backend correction and focal validation',
    'globalOrStandardBuildExecuted': False, 'idClosed': False,
    'disposition': 'backend input for FE04; root consolidation and consumer/global gates pending',
    'producerFigures': 'declarations until reviewed; producer report and evidence preserved',
    'sourcesFinalSha256': sources, 'artifactsSha256': artifact_hashes,
    'executions': executions, 'runtime': runtime,
    'distinctCases': {'guardAndAuth': 16, 'admissionDrainMonotonic': 3, 'session': 2, 'recovery': 25, 'total': 46},
    'countingLimits': 'Not one global run. Recovery-full24 zero-skips precedes focused monotonic and new transport case. Targeted -t excludes other tests; alias expands existing case. No diagnostic or repeat cases added.',
    'preservation': json.loads((annex / 'preservation-final.json').read_text()),
    'typecheck': json.loads((annex / 'types-comparison.json').read_text()),
    'cleanup': ownership,
    'cleanupObserved': json.loads((annex / 'cleanup-observed.json').read_text()),
    'limitations': [
        'No full typecheck green; seven unchanged diagnostics outside scope; no historical baseline execution.',
        'No SMTP/provider configured, no production recovery delivery, no frontend UI/browser consumer gate.',
        'Bounded transactions are not proof of arbitrary driver cancellation; unresolved jobs require quarantine.',
        'Reference cleanup does not promise GC timing or string zeroization.',
        'Bounded shared counts/GIN/infra comparison is not a full row snapshot.',
        'Historical JWT TTL maximum not measured; deletion/backups/retention policy pending.',
        'Source501 receipt reconstructed after first review edits by overlaying preserved received hashes.',
    ],
}
target = results / 'BE-05-implementacion-review-evidencia.json'
target.write_text(json.dumps(evidence, indent=2) + '\n')
links = re.findall(r'\[[^\]]+\]\(([^)]+)\)', report.read_text())
assert all((results / link.split('#')[0]).exists() for link in links)
print(json.dumps({'reportSha256': digest(report), 'evidenceSha256': digest(target),
                  'artifactCount': len(artifact_hashes), 'localReportLinksVerified': len(links),
                  'liveResources': ownership['liveResources'], 'distinctCases': 46}))
