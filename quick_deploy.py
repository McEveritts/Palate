import paramiko
import time
import sys
import threading
import os

sys.stdout.reconfigure(encoding='utf-8')

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh_key = os.path.expanduser('~/.ssh/id_ed25519_whatbox_venus')
client.connect('venus.whatbox.ca', username='betheenvy', key_filename=ssh_key)

def run(cmd, timeout=300, check=True):
    print(f'> {cmd}')
    stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)

    out_buf = []
    err_buf = []

    # Drain stdout and stderr concurrently using worker threads to prevent SSH channel deadlocks
    def drain_stdout():
        out_buf.append(stdout.read().decode('utf-8', errors='ignore'))
    def drain_stderr():
        err_buf.append(stderr.read().decode('utf-8', errors='ignore'))

    t_out = threading.Thread(target=drain_stdout)
    t_err = threading.Thread(target=drain_stderr)
    t_out.start()
    t_err.start()
    t_out.join()
    t_err.join()

    out = "".join(out_buf)
    err = "".join(err_buf)
    exit_status = stdout.channel.recv_exit_status()

    if out: print(out)
    if err: print(f'STDERR: {err}')
    if check and exit_status != 0:
        raise RuntimeError(f"Remote command failed with exit code {exit_status}:\n{cmd}\n{err}")
    return out

NVM = 'export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"'

print("=== 1. Pulling latest changes from GitHub ===")
run(f'cd ~/Palate && git fetch origin && git reset --hard origin/master')

print("=== 2. Installing dependencies and generating Prisma client ===")
run(f'{NVM} && cd ~/Palate && npm install && npx prisma generate')

print("=== 3. Running automated test suite ===")
run(f'{NVM} && cd ~/Palate && npm test')

print("=== 4. Backing up database prior to schema sync ===")
backup_script = (
    'export $(cat ~/Palate/.env | grep -v "^#" | xargs) && '
    'if [ -z "$DATABASE_URL" ]; then echo "FATAL: DATABASE_URL not set in ~/Palate/.env"; exit 1; fi && '
    'BACKUP_FILE=~/palate_backup_$(date +%Y%m%d_%H%M%S).sql && '
    'pg_dump "$DATABASE_URL" > "$BACKUP_FILE" && '
    'if [ ! -s "$BACKUP_FILE" ]; then echo "FATAL: pg_dump produced empty backup file: $BACKUP_FILE"; rm -f "$BACKUP_FILE"; exit 1; fi && '
    'echo "Backup verified: $(ls -lh $BACKUP_FILE)"'
)
run(f'bash -c \'{backup_script}\'')

print("=== 5. Syncing database schema ===")
run(f'{NVM} && cd ~/Palate && npx prisma db push')

print("=== 6. Building production bundle ===")
run(f'{NVM} && cd ~/Palate && npm run build', timeout=300)

print("=== 7. Restarting server ===")
run('screen -X -S palate quit || true', check=False)
run('pkill -f next-server || true', check=False)
time.sleep(2)
run('screen -dmS palate bash -c "/home/betheenvy/start_palate.sh"')
time.sleep(4)

print("=== 8. Verifying HTTP response ===")
run('curl --fail --silent --show-error --head --max-time 10 http://localhost:28014')

client.close()
print("\n=== Deploy complete and verified! ===")
