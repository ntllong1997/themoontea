"use client";

import { useState, useEffect } from "react";
import { getOrderHistory, saveOrderHistory, getLatestOrderNumber } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/Tabs";

export default function OrderSystem() {
  const [orders, setOrders] = useState([]);
  const [history, setHistory] = useState([]);

  // New state for Buldak Elote options
  const [spiciness, setSpiciness] = useState("Regular");
  const [exclusions, setExclusions] = useState([]); // e.g., ["No Corn", "No Nacho Cheese"]

  useEffect(() => {
    const fetchHistory = async () => {
      console.log(`📡 Fetching order history at: ${new Date().toISOString()}`);
      try {
        const groupedOrders = await getOrderHistory();
        setHistory(groupedOrders);
      } catch (error) {
        console.error("Failed to fetch order history:", error);
      }
    };

    fetchHistory();
    const intervalId = setInterval(fetchHistory, 3000); // Poll every 3s
    return () => clearInterval(intervalId);
  }, []);

  const PRICE = 12.0; // Flat price for Buldak Elote
  const PRODUCT_TYPE = "Buldak Elote";

  const SPICE_LEVELS = ["No Spicy", "Little", "Regular", "Extra"];
  const EXCLUSION_OPTIONS = ["No Corn", "No Nacho Cheese", "No Cotija", "No HotCheeto"];

  const toggleExclusion = (opt) => {
    setExclusions((prev) =>
      prev.includes(opt) ? prev.filter((x) => x !== opt) : [...prev, opt]
    );
  };

  const formatName = () => {
    const parts = [PRODUCT_TYPE];
    if (spiciness) parts.push(`— ${spiciness}`);
    if (exclusions.length > 0) parts.push(`( ${exclusions.join(", ")} )`);
    return parts.join(" ");
  };

  const handleAddItem = () => {
    const name = formatName();

    // Check if item with same options already exists; if so, bump quantity
    const existingIndex = orders.findIndex((item) => item.name === name);
    if (existingIndex >= 0) {
      const updated = [...orders];
      updated[existingIndex].quantity += 1;
      setOrders(updated);
    } else {
      const newItem = {
        name,
        price: PRICE,
        type: PRODUCT_TYPE,
        quantity: 1,
        // keep raw selections (optional for future use)
        _spiciness: spiciness,
        _exclusions: [...exclusions],
      };
      setOrders([...orders, newItem]);
    }
  };

  const handleQuantityChange = (index, delta) => {
    const updatedOrders = [...orders];
    updatedOrders[index].quantity += delta;
    if (updatedOrders[index].quantity <= 0) {
      updatedOrders.splice(index, 1); // Remove if quantity drops to 0
    }
    setOrders(updatedOrders);
  };

  const handleSendOrder = async () => {
    if (orders.length === 0) return;

    try {
      const latestOrderNumber = await getLatestOrderNumber();
      const nextOrderNumber = latestOrderNumber + 1;
      const timestamp = new Date().toISOString();

      const enrichedOrders = orders.flatMap((item) =>
        Array.from({ length: item.quantity }).map(() => ({
          orderNumber: nextOrderNumber,
          name: item.name,
          price: item.price,
          type: item.type,
          timestamp,
        }))
      );

      await saveOrderHistory(enrichedOrders);
      setHistory([...history, enrichedOrders]);
      setOrders([]);
    } catch (err) {
      console.error("Send order failed:", err);
    }
  };

  const taxRate = 0.0825;
  const subtotal = orders.reduce((acc, item) => acc + item.price * item.quantity, 0);
  const tax = subtotal * taxRate;
  const total = (subtotal + tax).toFixed(2);

  const calculateOrderTotal = (orderList) => {
    const sub = orderList.reduce((sum, item) => sum + item.price, 0);
    const tax = sub * taxRate;
    return (sub + tax).toFixed(2);
  };

  const calculateTotalRevenue = (history) => {
    return history
      .reduce((tot, orderList) => {
        const sub = orderList.reduce((sum, item) => sum + item.price, 0);
        const tax = sub * taxRate;
        return tot + sub + tax;
      }, 0)
      .toFixed(2);
  };

  return (
    <Tabs defaultValue="history" className="p-4">
      <TabsList className="fixed top-0 left-0 right-0 z-50 bg-white p-2 shadow">
        <TabsTrigger value="order">Order</TabsTrigger>
        <TabsTrigger value="history">History</TabsTrigger>
      </TabsList>

      <TabsContent value="order" className="mt-20">
        <div className="grid grid-cols-2 gap-4 mt-4">
          <Card className="col-span-2">
            <CardContent>
              <h2 className="text-xl font-bold mb-4">Order Panel</h2>

              {/* Spiciness Selector */}
              <div className="mb-4">
                <p className="font-semibold mb-2">Spiciness</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {SPICE_LEVELS.map((level) => (
                    <Button
                      key={level}
                      variant={spiciness === level ? "default" : "outline"}
                      className="w-full"
                      onClick={() => setSpiciness(level)}
                    >
                      {level}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Exclusions */}
              <div className="mb-6">
                <p className="font-semibold mb-2">Remove Ingredients</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {EXCLUSION_OPTIONS.map((opt) => {
                    const active = exclusions.includes(opt);
                    return (
                      <Button
                        key={opt}
                        variant={active ? "default" : "outline"}
                        className="w-full"
                        onClick={() => toggleExclusion(opt)}
                      >
                        {opt}
                      </Button>
                    );
                  })}
                </div>
              </div>

              <Button onClick={handleAddItem} className="w-full mb-6">
                Add Buldak Elote ($12)
              </Button>

              <h2 className="text-xl font-bold mb-4">Summary</h2>
              {orders.map((item, index) => (
                <div key={index} className="flex justify-between items-center mb-2">
                  <span>
                    {item.name} - ${item.price.toFixed(2)} x {item.quantity}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button size="sm" onClick={() => handleQuantityChange(index, -1)}>
                      -
                    </Button>
                    <Button size="sm" onClick={() => handleQuantityChange(index, 1)}>
                      +
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleQuantityChange(index, -item.quantity)}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ))}

              <div className="mt-4">
                <p>Subtotal: ${subtotal.toFixed(2)}</p>
                <p>Tax (8.25%): ${tax.toFixed(2)}</p>
                <p className="font-bold">Total: ${total}</p>
              </div>

              <Button onClick={handleSendOrder} className="mt-4 w-full">
                Send Order
              </Button>
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      <TabsContent value="history" className="mt-20">
        <Card className="mt-4">
          <CardContent>
            <h2 className="text-xl font-bold mb-4">Order History</h2>
            {history.map((orderList, index) => {
              const orderNumber = orderList[0]?.orderNumber ?? index + 1;
              return (
                <div key={index} className="mb-4 border-b pb-2">
                  <p className="font-semibold">
                    Order #{orderNumber} - Total: ${calculateOrderTotal(orderList)}
                  </p>
                  {orderList.map((item, itemIndex) => (
                    <div
                      key={itemIndex}
                      className={`text-sm p-1 rounded ${
                        item.type === PRODUCT_TYPE ? "bg-yellow-50" : "bg-blue-100"
                      }`}
                    >
                      {item.name} - ${item.price.toFixed(2)}
                    </div>
                  ))}
                </div>
              );
            })}
            <div className="mt-6 text-right font-bold text-lg">
              Total Revenue: ${calculateTotalRevenue(history)}
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
