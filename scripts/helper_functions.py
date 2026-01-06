import subprocess

def get_git_root():
    try:
        root = subprocess.check_output(
            ['git', 'rev-parse', '--show-toplevel'],
            stderr=subprocess.STDOUT
        ).decode('utf-8').strip()
        return root
    except subprocess.CalledProcessError:
        return None
