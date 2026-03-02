// Food loyalty points tracker
// Unified interface for Dominos, Starbucks, etc.

class FoodPoints {
  constructor() {
    this.services = {
      dominos: {
        enabled: true,
        balance: 60, // mock for now
        earnRate: 10, // points per $1
        rewardThreshold: 60
      },
      starbucks: {
        enabled: false, // needs API setup
        balance: 150,
        earnRate: 2, // stars per $1
        rewardThresholds: {
          drink: 150,
          food: 200,
          merch: 400
        }
      }
    };
  }

  // TODO: Replace with real API calls per service
  checkBalance(service) {
    const config = this.services[service];
    if (!config) {
      throw new Error(`Unknown service: ${service}`);
    }
    return config;
  }

  getAllBalances() {
    const balances = {};
    for (const [name, config] of Object.entries(this.services)) {
      if (config.enabled) {
        balances[name] = this.checkBalance(name);
      }
    }
    return balances;
  }

  calculateRewards(service, points) {
    const config = this.services[service];
    if (!config) return null;

    switch (service) {
      case 'dominos':
        return {
          freeItems: Math.floor(points / config.rewardThreshold),
          pointsToNext: config.rewardThreshold - (points % config.rewardThreshold)
        };
      case 'starbucks':
        return {
          canGetDrink: points >= config.rewardThresholds.drink,
          canGetFood: points >= config.rewardThresholds.food,
          starsToNextDrink: Math.max(0, config.rewardThresholds.drink - points)
        };
      default:
        return null;
    }
  }
}

module.exports = { FoodPoints };

// CLI interface
if (require.main === module) {
  const tracker = new FoodPoints();
  const command = process.argv[2];

  if (command === 'status') {
    const balances = tracker.getAllBalances();
    console.log('Food Rewards Status:\n');

    for (const [service, data] of Object.entries(balances)) {
      const rewards = tracker.calculateRewards(service, data.balance);
      if (!rewards) continue;

      switch (service) {
        case 'dominos':
          console.log(`Dominos: ${data.balance} points`);
          console.log(`  > ${rewards.freeItems} free pizzas available`);
          console.log(`  > ${rewards.pointsToNext} points to next reward\n`);
          break;
        case 'starbucks':
          console.log(`Starbucks: ${data.balance} stars`);
          if (rewards.canGetDrink) {
            console.log('  > Free drink available!\n');
          } else {
            console.log(`  > ${rewards.starsToNextDrink} stars to free drink\n`);
          }
          break;
      }
    }
  } else {
    console.log('Usage: node food-points.js status');
  }
}
