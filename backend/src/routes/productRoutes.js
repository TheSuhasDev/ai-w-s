import express from "express";
import mongoose from "mongoose";
import Product from "../models/Product.js";
import StockMovement from "../models/StockMovement.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = express.Router();

// Apply requireAuth to every /api/products route
router.use(requireAuth);

const parseQuantity = (value) => {
  const quantity = Number(value);
  return Number.isInteger(quantity) && quantity > 0 ? quantity : null;
};

// Get all products (STAFF & ADMIN)
router.get("/", async (req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 });

    res.json(products);
  } catch (error) {
    res.status(500).json({
      message: "Unable to load products",
      error: error.message,
    });
  }
});

// Dashboard metrics (STAFF & ADMIN)
router.get("/dashboard", async (req, res) => {
  try {
    const [products, dispatches, recentMovements] = await Promise.all([
      Product.find().sort({ name: 1 }),
      StockMovement.countDocuments({
        type: "DISPATCH",
        createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      }),
      StockMovement.find()
        .populate("product", "name sku")
        .sort({ createdAt: -1 })
        .limit(8),
    ]);

    res.json({
      totalProducts: products.length,
      totalStock: products.reduce((total, product) => total + product.stock, 0),
      lowStockProducts: products.filter(
        (product) => product.stock <= product.minimumStock
      ).length,
      todayDispatchCount: dispatches,
      recentMovements,
    });
  } catch (error) {
    res.status(500).json({ message: "Unable to load dashboard data" });
  }
});

// Smart Reorder Suggestions (requireAuth, any role)
router.get("/reorder-suggestions", async (req, res) => {
  try {
    let days = parseInt(req.query.days, 10);
    if (isNaN(days)) {
      days = 30;
    } else {
      days = Math.min(90, Math.max(7, days));
    }

    let coverDays = parseInt(req.query.coverDays, 10);
    if (isNaN(coverDays)) {
      coverDays = parseInt(process.env.REORDER_COVER_DAYS, 10) || 30;
    }
    coverDays = Math.max(1, coverDays);

    const windowStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [dispatchStats, products] = await Promise.all([
      StockMovement.aggregate([
        {
          $match: {
            type: "DISPATCH",
            createdAt: { $gte: windowStart },
          },
        },
        {
          $group: {
            _id: "$product",
            totalDispatched: { $sum: "$quantity" },
          },
        },
      ]),
      Product.find().sort({ name: 1 }),
    ]);

    const dispatchMap = new Map(
      dispatchStats.map((item) => [item._id.toString(), item.totalDispatched])
    );

    const items = products.map((product) => {
      const totalDispatched = dispatchMap.get(product._id.toString()) || 0;
      const avgDailyUsage = totalDispatched / days;
      const daysLeft =
        avgDailyUsage > 0
          ? Math.round((product.stock / avgDailyUsage) * 10) / 10
          : null;

      const suggestedReorder = Math.max(
        0,
        Math.ceil(avgDailyUsage * coverDays) + product.minimumStock - product.stock
      );

      let urgency = "OK";
      if (totalDispatched === 0) {
        urgency = "NO_DATA";
      } else if (
        product.stock <= product.minimumStock ||
        (daysLeft !== null && daysLeft <= 3)
      ) {
        urgency = "CRITICAL";
      } else if (daysLeft !== null && daysLeft <= 7) {
        urgency = "WARNING";
      } else {
        urgency = "OK";
      }

      let message;
      if (urgency === "NO_DATA") {
        message = `${product.name} has no recent dispatches`;
      } else if (product.stock === 0) {
        message = `${product.name} is out of stock`;
      } else if (daysLeft !== null) {
        message = `${product.name} will run out in ~${daysLeft} day${
          daysLeft === 1 ? "" : "s"
        }`;
      } else {
        message = `${product.name} stock level is stable`;
      }

      let reason;
      if (urgency === "NO_DATA") {
        reason = "No dispatch history in 30 days; current stock meets storage minimum.";
      } else if (suggestedReorder > 0) {
        const projectedDemand = Math.ceil(avgDailyUsage * coverDays);
        reason = `Covers ${coverDays}d projected demand (~${Math.round(avgDailyUsage * 10) / 10}/day = ${projectedDemand} units) + ${product.minimumStock} safety buffer − ${product.stock} on hand.`;
      } else {
        reason = `Current stock (${product.stock}) covers the ${coverDays}d projected demand (~${Math.round(avgDailyUsage * coverDays)} units) and safety threshold (${product.minimumStock}).`;
      }

      return {
        productId: product._id,
        name: product.name,
        sku: product.sku,
        stock: product.stock,
        minimumStock: product.minimumStock,
        totalDispatched,
        avgDailyUsage: Math.round(avgDailyUsage * 100) / 100,
        daysLeft,
        suggestedReorder,
        urgency,
        message,
        reason,
      };
    });

    const urgencyRank = {
      CRITICAL: 0,
      WARNING: 1,
      OK: 2,
      NO_DATA: 3,
    };

    items.sort((a, b) => {
      const rankDiff = urgencyRank[a.urgency] - urgencyRank[b.urgency];
      if (rankDiff !== 0) return rankDiff;
      if (a.daysLeft !== null && b.daysLeft !== null) {
        return a.daysLeft - b.daysLeft;
      }
      if (a.daysLeft !== null) return -1;
      if (b.daysLeft !== null) return 1;
      return a.name.localeCompare(b.name);
    });

    res.json({
      days,
      coverDays,
      generatedAt: new Date().toISOString(),
      items,
    });
  } catch (error) {
    res.status(500).json({
      message: "Unable to calculate reorder suggestions",
      error: error.message,
    });
  }
});

// Receive stock (STAFF & ADMIN)
router.patch("/:id/receive", async (req, res) => {
  try {
    const { quantity } = req.body;
    const parsedQuantity = parseQuantity(quantity);

    if (!parsedQuantity) {
      return res.status(400).json({
        message: "Quantity must be greater than 0",
      });
    }

    const product = await Product.findByIdAndUpdate(
      req.params.id,
      {
        $inc: { stock: parsedQuantity },
      },
      {
        returnDocument: "after",
      }
    );

    if (!product) {
      return res.status(404).json({
        message: "Product not found",
      });
    }

    // Record stock movement
    await StockMovement.create({
      product: product._id,
      type: "RECEIVE",
      quantity: parsedQuantity,
    });

    res.json({
      message: "Stock received successfully",
      product,
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to receive stock",
      error: error.message,
    });
  }
});

// Stock movement history (STAFF & ADMIN)
router.get("/movements/history", async (req, res) => {
  try {
    const movements = await StockMovement.find()
      .populate("product", "name sku")
      .sort({ createdAt: -1 });

    res.json(movements);
  } catch (error) {
    res.status(500).json({
      message: "Unable to load stock history",
      error: error.message,
    });
  }
});

// Dispatch stock (ADMIN only)
router.patch("/:id/dispatch", requireRole("ADMIN"), async (req, res) => {
  try {
    const { quantity } = req.body;
    const parsedQuantity = parseQuantity(quantity);

    if (!parsedQuantity) {
      return res.status(400).json({
        message: "Quantity must be greater than 0",
      });
    }

    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        message: "Product not found",
      });
    }

    if (product.stock < parsedQuantity) {
      return res.status(400).json({
        message: "Insufficient stock",
        availableStock: product.stock,
      });
    }

    product.stock -= parsedQuantity;
    await product.save();

    // Record dispatch movement
    await StockMovement.create({
      product: product._id,
      type: "DISPATCH",
      quantity: parsedQuantity,
    });

    res.json({
      message: "Stock dispatched successfully",
      product,
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to dispatch stock",
      error: error.message,
    });
  }
});

// Direct stock dispatch transaction (ADMIN only)
router.post("/dispatch/transaction", requireRole("ADMIN"), async (req, res) => {
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  const client = req.body.client || {};

  if (
    !items.length ||
    !client.name?.trim() ||
    !client.phone?.trim() ||
    !client.address?.trim()
  ) {
    return res.status(400).json({
      message: "Client name, phone, address, and at least one item are required",
    });
  }

  const session = await mongoose.startSession();
  try {
    let updatedProducts = [];
    await session.withTransaction(async () => {
      for (const item of items) {
        const quantity = parseQuantity(item.quantity);
        if (!quantity) throw new Error("Every dispatch quantity must be a positive integer");

        const product = await Product.findOneAndUpdate(
          { _id: item.productId, stock: { $gte: quantity } },
          { $inc: { stock: -quantity } },
          { returnDocument: "after", session }
        );
        if (!product) throw new Error("A product is missing or has insufficient stock");

        await StockMovement.create(
          [{ product: product._id, type: "DISPATCH", quantity }],
          { session }
        );
        updatedProducts.push({ product, quantity });
      }
    });

    res.json({ message: "Dispatch completed successfully", products: updatedProducts });
  } catch (error) {
    const message = error.message || "";
    res.status(message.toLowerCase().includes("insufficient") || message.toLowerCase().includes("missing")
      ? 400
      : 500).json({ message: error.message || "Dispatch failed" });
  } finally {
    await session.endSession();
  }
});

export default router;