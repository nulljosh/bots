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
        stars: 150,
        earnRate: 2, // stars per $1  
        rewardThresholds: {
          drink: 150,
          food: 200,
          merch: 400
        }
      }
    };
  }

  async checkBalance(service) {
    if (!this.services[service]) {
      throw new Error(`Unknown service: ${service}`);
    }
    
    // TODO: Real API calls
    return this.services[service];
  }

  async getAllBalances() {
    const balances = {};
    for (const [name, config] of Object.entries(this.services)) {
      if (config.enabled) {
        balances[name] = await this.checkBalance(name);
      }
    }
    return balances;
  }

  calculateRewards(service, points) {
    const config = this.services[service];
    if (!config) return null;

    if (service === 'dominos') {
      return {
        freeItems: Math.floor(points / config.rewardThreshold),
        pointsToNext: config.rewardThreshold - (points % config.rewardThreshold)
      };
    } else if (service === 'starbucks') {
      return {
        canGetDrink: points >= config.rewardThresholds.drink,
        canGetFood: points >= config.rewardThresholds.food,
        starsToNextDrink: Math.max(0, config.rewardThresholds.drink - points)
      };
    }
  }
}

module.exports = { FoodPoints };

// CLI interface
if (require.main === module) {
  const points = new FoodPoints();
  
  const command = process.argv[2];
  
  if (command === 'status') {
    points.getAllBalances().then(balances => {
      console.log('🍕 Food Rewards Status:\n');
      
      for (const [service, data] of Object.entries(balances)) {
        if (service === 'dominos') {
          const rewards = points.calculateRewards(service, data.balance);
          console.log(`Dominos: ${data.balance} points`);
          console.log(`  → ${rewards.freeItems} free pizzas available`);
          console.log(`  → ${rewards.pointsToNext} points to next reward\n`);
        } else if (service === 'starbucks' && data.enabled) {
          const rewards = points.calculateRewards(service, data.stars);
          console.log(`Starbucks: ${data.stars} stars`);
          if (rewards.canGetDrink) console.log(`  → Free drink available!`);
          else console.log(`  → ${rewards.starsToNextDrink} stars to free drink\n`);
        }
      }
    });
  } else {
    console.log('Usage: node food-points.js status');
  }
}
