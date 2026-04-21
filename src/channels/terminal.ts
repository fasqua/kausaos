/**
 * KausaOS - Terminal Channel
 * Interactive CLI chat interface for dev/testing
 */

import readline from 'readline';
import chalk from 'chalk';
import { Brain } from '../brain';

export class TerminalChannel {
  private brain: Brain;
  private rl: readline.Interface | null;
  private running: boolean;

  constructor(brain: Brain) {
    this.brain = brain;
    this.rl = null;
    this.running = false;
  }

  async start(): Promise<void> {
    this.running = true;
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log(chalk.cyan('\n╔══════════════════════════════════════════╗'));
    console.log(chalk.cyan('║') + chalk.bold.white('        KausaOS Terminal v0.1.0          ') + chalk.cyan('║'));
    console.log(chalk.cyan('║') + chalk.gray('   Privacy Agent Framework for Solana    ') + chalk.cyan('║'));
    console.log(chalk.cyan('╚══════════════════════════════════════════╝'));
    console.log(chalk.gray('\nType your message to interact with KausaOS.'));
    console.log(chalk.gray('Commands: /quit /clear /status /strategies\n'));

    this.prompt();
  }

  private prompt(): void {
    if (!this.rl || !this.running) return;

    this.rl.question(chalk.green('you > '), async (input) => {
      const trimmed = input.trim();
      if (!trimmed) {
        this.prompt();
        return;
      }

      // Handle local commands
      if (trimmed.startsWith('/')) {
        await this.handleCommand(trimmed);
        this.prompt();
        return;
      }

      // Send to brain
      try {
        console.log(chalk.gray('\n  thinking...\n'));
        const response = await this.brain.processMessage(trimmed);
        console.log(chalk.cyan('kausaos > ') + response + '\n');
      } catch (err: any) {
        console.log(chalk.red('error > ') + err.message + '\n');
      }

      this.prompt();
    });

    this.rl.on('close', () => {
      this.stop();
    });
  }

  private async handleCommand(cmd: string): Promise<void> {
    switch (cmd) {
      case '/quit':
      case '/exit':
        console.log(chalk.yellow('\nShutting down KausaOS...\n'));
        this.stop();
        process.exit(0);
        break;

      case '/clear':
        this.brain.clearHistory();
        console.log(chalk.yellow('\nConversation history cleared.\n'));
        break;

      case '/status':
        try {
          const health = await this.brain.getApiClient().health();
          const stats = await this.brain.getApiClient().stats();
          console.log(chalk.cyan('\n--- System Status ---'));
          console.log(chalk.white(`Backend: ${health.success ? 'healthy' : 'unreachable'}`));
          if (stats.success && stats.data) {
            console.log(chalk.white(`Protocol stats: ${JSON.stringify(stats.data, null, 2)}`));
          }
          console.log('');
        } catch (err: any) {
          console.log(chalk.red(`Status check failed: ${err.message}\n`));
        }
        break;

      case '/strategies':
        console.log(chalk.cyan('\n--- Strategies ---'));
        console.log(chalk.gray('(Managed via strategy engine. Use natural language to create/list.)\n'));
        break;

      default:
        console.log(chalk.gray(`\nUnknown command: ${cmd}`));
        console.log(chalk.gray('Available: /quit /clear /status /strategies\n'));
    }
  }

  stop(): void {
    this.running = false;
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
  }
}
