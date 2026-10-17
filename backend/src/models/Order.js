import mongoose from "mongoose";
import { DEFAULT_ADVANCE_PERCENTAGE } from "../config/orderSettings.js";

const orderItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    name: { type: String, required: true, trim: true },
    sku: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, required: true, unique: true, index: true },
    client: {
      name: { type: String, required: true, trim: true },
      phone: { type: String, required: true, trim: true },
      address: { type: String, required: true, trim: true },
      gstin: { type: String, trim: true, default: "" },
    },
    items: { type: [orderItemSchema], required: true, validate: [(items) => items.length > 0, "At least one item is required"] },
    totalAmount: { type: Number, required: true, min: 0 },
    advancePercentage: { type: Number, required: true, min: 0, max: 100, default: DEFAULT_ADVANCE_PERCENTAGE },
    advanceRequired: { type: Number, required: true, min: 0, default: 0 },
    totalPaid: { type: Number, default: 0, min: 0 },
    advanceAmount: { type: Number, default: 0, min: 0 },
    balanceAmount: { type: Number, default: 0, min: 0 },
    paymentStatus: {
      type: String,
      enum: ["ADVANCE_PENDING", "ADVANCE_RECEIVED", "FULL_PAYMENT_PENDING", "FULLY_PAID"],
      default: "ADVANCE_PENDING",
    },
    status: {
      type: String,
      enum: ["PROCESSING", "ADVANCE_RECEIVED", "PACKED", "DISPATCHED", "CANCELLED"],
      default: "PROCESSING",
      index: true,
    },
    packedAt: Date,
    dispatchedAt: Date,
    cancelledAt: Date,
    lastReminderAt: Date,
    reminders: [
      {
        sentAt: { type: Date, default: Date.now },
        channel: {
          type: String,
          enum: ["WHATSAPP", "EMAIL", "CALL", "MANUAL"],
          required: true,
        },
        note: { type: String, default: "" },
        sentBy: { type: String, default: "" },
      },
    ],
  },
  { timestamps: true }
);

orderSchema.pre("validate", function updatePaymentFields() {
  this.advancePercentage = Number(this.advancePercentage ?? DEFAULT_ADVANCE_PERCENTAGE);
  this.advanceRequired = Math.round(this.totalAmount * this.advancePercentage) / 100;
  this.totalPaid = Number(this.totalPaid || 0);
  this.advanceAmount = Math.min(this.advanceRequired, Number(this.advanceAmount || this.totalPaid));
  this.balanceAmount = Math.max(0, this.totalAmount - this.totalPaid);
  if (this.totalPaid >= this.totalAmount && this.totalAmount > 0) {
    this.paymentStatus = "FULLY_PAID";
  } else if (this.totalPaid >= this.advanceRequired) {
    this.paymentStatus = this.status === "PACKED" || this.status === "DISPATCHED" ? "FULL_PAYMENT_PENDING" : "ADVANCE_RECEIVED";
  } else if (this.totalPaid > 0) {
    this.paymentStatus = "ADVANCE_PENDING";
  } else {
    this.paymentStatus = "ADVANCE_PENDING";
  }
});

export const markOrderPacked = (order) => {
  order.status = "PACKED";
  if (!order.packedAt) {
    order.packedAt = new Date();
  }
};

export const migrateOrderStatuses = async () => {
  await Order.updateMany({ status: "PAYMENT_CONFIRMED" }, { $set: { status: "ADVANCE_RECEIVED" } });
  await Order.updateMany({ status: { $in: ["PACKING", "READY_FOR_DISPATCH"] } }, { $set: { status: "PACKED" } });

  // Fallback for existing PACKED orders without packedAt
  const packedWithoutDate = await Order.find({ status: "PACKED", packedAt: { $exists: false } });
  for (const order of packedWithoutDate) {
    order.packedAt = order.updatedAt || order.createdAt || new Date();
    await order.save();
  }

  const legacyOrders = await Order.find({
    $or: [{ advancePercentage: { $exists: false } }, { advanceRequired: { $exists: false } }],
  });
  for (const order of legacyOrders) {
    order.advancePercentage = Number(order.advancePercentage || DEFAULT_ADVANCE_PERCENTAGE);
    order.advanceRequired = Math.round(order.totalAmount * order.advancePercentage) / 100;
    await order.save();
  }
};

const Order = mongoose.model("Order", orderSchema);

export default Order;
