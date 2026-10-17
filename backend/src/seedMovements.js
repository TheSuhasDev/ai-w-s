import dotenv from "dotenv";
import mongoose from "mongoose";
import connectDB from "./config/database.js";
import Product from "./models/Product.js";
import StockMovement from "./models/StockMovement.js";

dotenv.config();

const DEMO_LABEL = "DEMO_REORDER_SEED";

const seedDemoMovements = async () => {
  try {
    await connectDB();

    const products = await Product.find().sort({ name: 1 });
    if (!products.length) {
      console.log("No products found in database. Run 'npm run seed' first to initialize products.");
      await mongoose.connection.close();
      process.exit(0);
    }

    // Clean up previous demo-seeded movements only
    const deleted = await StockMovement.deleteMany({ note: DEMO_LABEL });
    if (deleted.deletedCount > 0) {
      console.log(`Cleaned up ${deleted.deletedCount} previous demo dispatch movements.`);
    }

    const movements = [];
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    /**
     * Map target urgency profiles to products:
     * - CRITICAL: Hammer (stock 20) -> avg daily ~8 -> daysLeft ~2.5 <= 3
     * - WARNING:  Drill (stock 10)  -> avg daily ~1.8 -> daysLeft ~5.5 (3 < daysLeft <= 7)
     * - OK:       Screwdriver (stock 25) -> avg daily ~0.8 -> daysLeft ~31.25 > 7
     * - OK:       Pliers (stock 15)      -> avg daily ~0.5 -> daysLeft ~30 > 7
     * - NO_DATA:  Wrench (stock 15)      -> 0 dispatches
     */

    // Helper to generate distributed dispatch movements across the 30-day window
    const distributeDispatches = (productId, totalQuantity, dispatchCount) => {
      const baseQty = Math.floor(totalQuantity / dispatchCount);
      let remainder = totalQuantity - baseQty * dispatchCount;

      for (let i = 0; i < dispatchCount; i++) {
        // Distribute days backwards: from 1 day ago to 29 days ago
        const dayOffset = Math.max(1, Math.floor((i + 1) * (28 / dispatchCount)));
        const hoursOffset = (i * 3) % 24;
        const movementDate = new Date(now - dayOffset * dayMs - hoursOffset * 3600 * 1000);
        const qty = baseQty + (remainder > 0 ? 1 : 0);
        if (remainder > 0) remainder--;

        movements.push({
          product: productId,
          type: "DISPATCH",
          quantity: qty,
          note: DEMO_LABEL,
          createdAt: movementDate,
          updatedAt: movementDate,
        });
      }
    };

    products.forEach((product, idx) => {
      const name = product.name.toLowerCase();

      if (name.includes("hammer")) {
        // Target: CRITICAL (daysLeft <= 3)
        const targetDaily = Math.max(1, product.stock / 2.5);
        const total = Math.max(10, Math.round(targetDaily * 30));
        distributeDispatches(product._id, total, 15);
        console.log(`- ${product.name} (Stock: ${product.stock}, Min: ${product.minimumStock}) -> CRITICAL (${total} units across 30 days)`);
      } else if (name.includes("drill")) {
        // Target: WARNING (3 < daysLeft <= 7 and stock > minStock)
        const safeStock = Math.max(product.stock, product.minimumStock + 1);
        const targetDaily = Math.max(0.2, safeStock / 5.5);
        const total = Math.max(5, Math.round(targetDaily * 30));
        distributeDispatches(product._id, total, 8);
        console.log(`- ${product.name} (Stock: ${product.stock}, Min: ${product.minimumStock}) -> WARNING (${total} units across 30 days)`);
      } else if (name.includes("screwdriver")) {
        // Target: OK (daysLeft > 7)
        const targetDaily = Math.max(0.1, product.stock / 25);
        const total = Math.max(3, Math.round(targetDaily * 30));
        distributeDispatches(product._id, total, 6);
        console.log(`- ${product.name} (Stock: ${product.stock}, Min: ${product.minimumStock}) -> OK (${total} units across 30 days)`);
      } else if (name.includes("pliers")) {
        // Target: OK (daysLeft > 7)
        const targetDaily = Math.max(0.1, product.stock / 20);
        const total = Math.max(3, Math.round(targetDaily * 30));
        distributeDispatches(product._id, total, 5);
        console.log(`- ${product.name} (Stock: ${product.stock}, Min: ${product.minimumStock}) -> OK (${total} units across 30 days)`);
      } else if (name.includes("wrench")) {
        // Target: NO_DATA (0 dispatches)
        console.log(`- ${product.name} (Stock: ${product.stock}, Min: ${product.minimumStock}) -> NO_DATA (0 dispatches in 30 days)`);
      } else {
        // Fallback for custom products: alternate profiles
        if (idx % 3 === 0) {
          distributeDispatches(product._id, 120, 12);
        } else if (idx % 3 === 1) {
          distributeDispatches(product._id, 30, 6);
        }
      }
    });

    if (movements.length > 0) {
      await StockMovement.insertMany(movements);
      console.log(`Successfully seeded ${movements.length} realistic DISPATCH records across the past 30 days.`);
    }

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error("Demo movement seeding failed:", error.message);
    process.exit(1);
  }
};

seedDemoMovements();
