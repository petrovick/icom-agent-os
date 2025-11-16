# Instructions
## Install Agent-os globally on the machine
```
curl -sSL https://raw.githubusercontent.com/buildermethods/agent-os/main/scripts/base-install.sh | bash
```

# Install agent-os to the project
```
~/agent-os/scripts/project-install.sh
```

## Project Standards

- All engineers should review the backend architecture reference at `agent-os/standards/backend/architecture.md` before planning or implementing Pix-related services so that dependency injection, queue usage, and SPI stream behavior stay consistent across repos.
