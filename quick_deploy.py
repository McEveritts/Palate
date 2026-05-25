import paramiko
import time
import sys
sys.stdout.reconfigure(encoding='utf-8')

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('pomelo.whatbox.ca', username='betheenvy', password='22Plok00!')

def run(cmd, timeout=300):
    print(f'> {cmd}')
    stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode('utf-8', errors='ignore')
    err = stderr.read().decode('utf-8', errors='ignore')
    if out: print(out)
    if err: print(f'STDERR: {err}')
    return out

NVM = 'export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"'

print("=== Pulling latest changes from GitHub ===")
run(f'cd ~/Palate && git stash && git pull origin master && git stash pop || true')

print("=== Syncing database schema ===")
run(f'{NVM} && cd ~/Palate && npx prisma db push')

print("=== Installing ALL deps (including dev for build) ===")
run(f'{NVM} && cd ~/Palate && npm install && npx prisma generate')

print("=== Building production bundle ===")
run(f'{NVM} && cd ~/Palate && npm run build', timeout=300)

print("=== Restarting server ===")
run('screen -X -S palate quit || true')
run('pkill -f next-server || true')
time.sleep(2)
run('screen -dmS palate bash -c "/home/betheenvy/start_palate.sh"')
time.sleep(4)

print("=== Verifying ===")
run('curl -sI http://localhost:28014 | head -3')

client.close()
print("\n=== Deploy complete! ===")
