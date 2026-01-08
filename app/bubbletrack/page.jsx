const receiptItems = [
    {
        vendor: 'H-E-B',
        location: 'Moon Tea',
        tag: 'ingredients',
        total: '$1.34',
        date: 'Sep 25, 2023',
    },
    {
        vendor: 'Lotus Market',
        location: 'Pearl Plaza',
        tag: 'toppings',
        total: '$24.10',
        date: 'Sep 23, 2023',
    },
    {
        vendor: 'Taiwan Tea Co.',
        location: 'Sunset Strip',
        tag: 'tea leaves',
        total: '$82.40',
        date: 'Sep 21, 2023',
    },
];

const inventoryRows = [
    {
        item: 'Sliced Limes',
        shop: 'Moon Tea',
        category: 'other',
        quantity: '1 pcs',
        reorder: '0 pcs',
    },
    {
        item: 'Tapioca Pearls',
        shop: 'Pearl Plaza',
        category: 'toppings',
        quantity: '18 bags',
        reorder: '4 bags',
    },
    {
        item: 'Oolong Tea',
        shop: 'Sunset Strip',
        category: 'tea leaves',
        quantity: '5 kg',
        reorder: '2 kg',
    },
];

const userRoles = [
    {
        name: 'Avery Liu',
        role: 'Ops Manager',
        locations: 'All Locations',
    },
    {
        name: 'Camila Ortiz',
        role: 'Shop Lead',
        locations: 'Moon Tea',
    },
    {
        name: 'Noah Kim',
        role: 'Inventory Clerk',
        locations: 'Pearl Plaza · Sunset Strip',
    },
];

const kpiCards = [
    {
        title: 'Receipts Processed',
        value: '124',
        note: 'Last 30 days',
    },
    {
        title: 'Inventory Items',
        value: '368',
        note: 'Across 3 shops',
    },
    {
        title: 'Cost Variance',
        value: '-2.4%',
        note: 'vs last month',
    },
];

const shopCards = [
    {
        name: 'Moon Tea',
        city: 'Austin, TX',
        manager: 'Camila Ortiz',
        status: 'Open',
        receipts: '48',
    },
    {
        name: 'Pearl Plaza',
        city: 'Houston, TX',
        manager: 'Noah Kim',
        status: 'Open',
        receipts: '39',
    },
    {
        name: 'Sunset Strip',
        city: 'Los Angeles, CA',
        manager: 'Jamie Park',
        status: 'Low Stock',
        receipts: '37',
    },
];

const lowStockAlerts = [
    {
        item: 'Tapioca Pearls',
        location: 'Sunset Strip',
        remaining: '2 bags',
        reorderAt: '4 bags',
    },
    {
        item: 'Oat Milk',
        location: 'Pearl Plaza',
        remaining: '6 cartons',
        reorderAt: '8 cartons',
    },
    {
        item: 'Cup Lids',
        location: 'Moon Tea',
        remaining: '120 pcs',
        reorderAt: '200 pcs',
    },
];

const expenseBreakdown = [
    { label: 'Ingredients', value: '$4,320', percent: '48%' },
    { label: 'Packaging', value: '$1,860', percent: '21%' },
    { label: 'Labor', value: '$2,140', percent: '24%' },
    { label: 'Utilities', value: '$640', percent: '7%' },
];

const expenseEntries = [
    {
        vendor: 'Fresh Leaf Supply',
        category: 'Ingredients',
        amount: '$312.40',
        location: 'Moon Tea',
        date: 'Sep 27, 2023',
    },
    {
        vendor: 'PackRight',
        category: 'Packaging',
        amount: '$188.60',
        location: 'Pearl Plaza',
        date: 'Sep 26, 2023',
    },
    {
        vendor: 'City Power',
        category: 'Utilities',
        amount: '$94.20',
        location: 'Sunset Strip',
        date: 'Sep 24, 2023',
    },
];

const activityFeed = [
    {
        title: 'Receipt processed via Vision OCR',
        note: 'H-E-B · Moon Tea',
        time: '10 min ago',
    },
    {
        title: 'Inventory updated',
        note: 'Tapioca Pearls +12 bags',
        time: '1 hr ago',
    },
    {
        title: 'Expense logged',
        note: 'Packaging · Pearl Plaza',
        time: '3 hr ago',
    },
];

const dataModel = `-- Shops & users\ncreate table shops (\n  id uuid primary key default gen_random_uuid(),\n  name text not null,\n  timezone text not null,\n  created_at timestamptz default now()\n);\n\ncreate table staff (\n  id uuid primary key default gen_random_uuid(),\n  full_name text not null,\n  role text not null,\n  created_at timestamptz default now()\n);\n\ncreate table staff_locations (\n  staff_id uuid references staff(id) on delete cascade,\n  shop_id uuid references shops(id) on delete cascade,\n  primary key (staff_id, shop_id)\n);\n\ncreate table receipts (\n  id uuid primary key default gen_random_uuid(),\n  shop_id uuid references shops(id),\n  vendor text not null,\n  total numeric(10,2) not null,\n  purchased_at date not null,\n  image_path text not null,\n  ocr_payload jsonb,\n  created_at timestamptz default now()\n);\n\ncreate table inventory_items (\n  id uuid primary key default gen_random_uuid(),\n  shop_id uuid references shops(id),\n  name text not null,\n  category text not null,\n  quantity numeric(10,2) not null,\n  unit text not null,\n  reorder_level numeric(10,2) not null,\n  unit_cost numeric(10,2) not null,\n  supplier text,\n  last_restocked date\n);`;

const supabasePolicies = `-- Row level security by assigned locations\ncreate policy \"staff_shop_access\"\n  on receipts for select\n  using (exists (\n    select 1\n    from staff_locations\n    where staff_locations.shop_id = receipts.shop_id\n      and staff_locations.staff_id = auth.uid()\n  ));\n\ncreate policy \"staff_inventory_access\"\n  on inventory_items for all\n  using (exists (\n    select 1\n    from staff_locations\n    where staff_locations.shop_id = inventory_items.shop_id\n      and staff_locations.staff_id = auth.uid()\n  ));`;

const visionRoute = `import OpenAI from 'openai';\nimport { createClient } from '@/lib/supabase/server';\n\nexport async function POST(request: Request) {\n  const formData = await request.formData();\n  const image = formData.get('image') as File;\n  const shopId = formData.get('shopId') as string;\n\n  const supabase = createClient();\n  const upload = await supabase.storage\n    .from('receipts')\n    .upload(\`\${shopId}/\${image.name}\`, image);\n\n  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });\n  const response = await openai.responses.create({\n    model: 'gpt-4.1-mini',\n    input: [\n      { role: 'system', content: 'Extract vendor, date, line items, and totals.' },\n      { role: 'user', content: [\n        { type: 'input_text', text: 'Parse this receipt.' },\n        { type: 'input_image', image_url: upload.data?.path! }\n      ]}\n    ]\n  });\n\n  const receipt = JSON.parse(response.output_text);\n  await supabase.from('receipts').insert({\n    shop_id: shopId,\n    vendor: receipt.vendor,\n    total: receipt.total,\n    purchased_at: receipt.date,\n    image_path: upload.data?.path,\n    ocr_payload: receipt\n  });\n\n  return Response.json({ receipt });\n}`;

const costPipeline = `export async function updateCostSummary(shopId: string) {\n  const supabase = createClient();\n  const { data: items } = await supabase\n    .from('inventory_items')\n    .select('quantity, unit_cost')\n    .eq('shop_id', shopId);\n\n  const totalOnHand = (items ?? []).reduce(\n    (sum, item) => sum + item.quantity * item.unit_cost,\n    0\n  );\n\n  await supabase.from('shop_costs').upsert({\n    shop_id: shopId,\n    on_hand_value: totalOnHand\n  });\n}`;

const appRouterExample = `export default function ReceiptsPage() {\n  return (\n    <main>\n      <h1>Receipts</h1>\n      <UploadReceiptCard />\n      <ReceiptGrid />\n    </main>\n  );\n}\n\nexport async function generateMetadata() {\n  return { title: 'BubbleTrack · Receipts' };\n}`;

export default function BubbleTrackPage() {
    return (
        <div className="min-h-screen bg-slate-50 text-slate-900">
            <header className="border-b border-slate-200 bg-white">
                <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-6">
                    <div className="flex items-center gap-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-2xl">
                            🧋
                        </div>
                        <div>
                            <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
                                BubbleTrack
                            </p>
                            <h1 className="text-2xl font-semibold text-slate-900">
                                Internal Ops Workspace
                            </h1>
                            <p className="text-sm text-slate-500">
                                Receipts, inventory, and cost tracking across multiple
                                locations.
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">
                            App Router · TypeScript
                        </span>
                        <span className="rounded-full bg-orange-50 px-3 py-1 text-sm font-medium text-orange-600">
                            Supabase + Vision OCR
                        </span>
                    </div>
                </div>
            </header>

            <section className="mx-auto max-w-6xl px-6 py-8">
                <div className="grid gap-6 md:grid-cols-3">
                    {kpiCards.map((card) => (
                        <div
                            key={card.title}
                            className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
                        >
                            <p className="text-sm text-slate-500">{card.title}</p>
                            <p className="mt-2 text-3xl font-semibold text-slate-900">
                                {card.value}
                            </p>
                            <p className="mt-2 text-sm text-slate-400">
                                {card.note}
                            </p>
                        </div>
                    ))}
                </div>
            </section>

            <section className="mx-auto max-w-6xl px-6 pb-10">
                <div className="flex flex-wrap gap-3 rounded-2xl bg-white p-4 shadow-sm">
                    {[
                        { label: 'Dashboard', anchor: '#dashboard' },
                        { label: 'Shops', anchor: '#shops' },
                        { label: 'Receipts', anchor: '#receipts' },
                        { label: 'Inventory', anchor: '#inventory' },
                        { label: 'Expenses', anchor: '#expenses' },
                    ].map((tab) => (
                        <a
                            key={tab.label}
                            href={tab.anchor}
                            className={`rounded-xl px-4 py-2 text-sm font-medium ${
                                tab.label === 'Receipts'
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : 'text-slate-500 hover:bg-slate-50'
                            }`}
                        >
                            {tab.label}
                        </a>
                    ))}
                </div>
            </section>

            <section
                id="dashboard"
                className="mx-auto grid max-w-6xl gap-8 px-6 pb-12 lg:grid-cols-[1.1fr_0.9fr]"
            >
                <div className="space-y-8">
                    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                        <div className="flex items-center justify-between">
                            <h2 className="text-2xl font-semibold text-slate-900">
                                Dashboard
                            </h2>
                            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                                Real-time overview
                            </span>
                        </div>
                        <div className="mt-5 grid gap-4 md:grid-cols-2">
                            {activityFeed.map((item) => (
                                <div
                                    key={item.title}
                                    className="rounded-2xl border border-slate-100 bg-slate-50 p-4"
                                >
                                    <p className="text-sm font-semibold text-slate-900">
                                        {item.title}
                                    </p>
                                    <p className="text-xs text-slate-500">
                                        {item.note}
                                    </p>
                                    <p className="mt-2 text-xs text-slate-400">
                                        {item.time}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                        <h3 className="text-lg font-semibold text-slate-900">
                            Low stock alerts
                        </h3>
                        <p className="mt-1 text-sm text-slate-500">
                            Automatic reorder warnings by location.
                        </p>
                        <div className="mt-4 space-y-3">
                            {lowStockAlerts.map((alert) => (
                                <div
                                    key={alert.item}
                                    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3"
                                >
                                    <div>
                                        <p className="text-sm font-semibold text-slate-900">
                                            {alert.item}
                                        </p>
                                        <p className="text-xs text-slate-500">
                                            {alert.location}
                                        </p>
                                    </div>
                                    <div className="text-xs font-semibold text-amber-700">
                                        {alert.remaining} · Reorder at{' '}
                                        {alert.reorderAt}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="space-y-8">
                    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                        <h3 className="text-lg font-semibold text-slate-900">
                            Expense breakdown
                        </h3>
                        <p className="mt-1 text-sm text-slate-500">
                            Month-to-date totals by category.
                        </p>
                        <div className="mt-4 space-y-3">
                            {expenseBreakdown.map((expense) => (
                                <div
                                    key={expense.label}
                                    className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3"
                                >
                                    <div>
                                        <p className="text-sm font-semibold text-slate-900">
                                            {expense.label}
                                        </p>
                                        <p className="text-xs text-slate-500">
                                            {expense.percent} of spend
                                        </p>
                                    </div>
                                    <span className="text-sm font-semibold text-emerald-700">
                                        {expense.value}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                        <h3 className="text-lg font-semibold text-slate-900">
                            Recent receipts
                        </h3>
                        <p className="mt-1 text-sm text-slate-500">
                            AI-processed receipts across all shops.
                        </p>
                        <div className="mt-4 space-y-3">
                            {receiptItems.map((receipt) => (
                                <div
                                    key={`${receipt.vendor}-recent`}
                                    className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3"
                                >
                                    <div>
                                        <p className="text-sm font-semibold text-slate-900">
                                            {receipt.vendor}
                                        </p>
                                        <p className="text-xs text-slate-500">
                                            {receipt.location} · {receipt.date}
                                        </p>
                                    </div>
                                    <span className="text-sm font-semibold text-slate-900">
                                        {receipt.total}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            <section
                id="shops"
                className="mx-auto max-w-6xl space-y-6 px-6 pb-12"
            >
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h2 className="text-2xl font-semibold text-slate-900">
                            Shops
                        </h2>
                        <p className="text-sm text-slate-500">
                            Manage locations, managers, and receipt volume.
                        </p>
                    </div>
                    <button
                        className="rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-white"
                        type="button"
                    >
                        + Add Location
                    </button>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                    {shopCards.map((shop) => (
                        <div
                            key={shop.name}
                            className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
                        >
                            <div className="flex items-center justify-between">
                                <h3 className="text-lg font-semibold text-slate-900">
                                    {shop.name}
                                </h3>
                                <span
                                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                        shop.status === 'Open'
                                            ? 'bg-emerald-100 text-emerald-700'
                                            : 'bg-amber-100 text-amber-700'
                                    }`}
                                >
                                    {shop.status}
                                </span>
                            </div>
                            <p className="mt-1 text-sm text-slate-500">
                                {shop.city}
                            </p>
                            <div className="mt-4 space-y-2 text-sm">
                                <div className="flex items-center justify-between">
                                    <span className="text-slate-500">Manager</span>
                                    <span className="font-semibold text-slate-900">
                                        {shop.manager}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-slate-500">
                                        Receipts (30d)
                                    </span>
                                    <span className="font-semibold text-slate-900">
                                        {shop.receipts}
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            <section
                id="receipts"
                className="mx-auto grid max-w-6xl gap-8 px-6 pb-12 lg:grid-cols-[1.1fr_0.9fr]"
            >
                <div className="space-y-8">
                    <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-6">
                        <h2 className="text-3xl font-semibold text-slate-900">
                            Receipts
                        </h2>
                        <p className="mt-2 text-slate-600">
                            Upload and manage receipts with AI-powered OCR and
                            categorization.
                        </p>
                        <div className="mt-6 rounded-2xl border border-dashed border-emerald-200 bg-white p-6">
                            <p className="text-sm font-semibold text-emerald-700">
                                ✨ Upload Receipt
                            </p>
                            <div className="mt-4 grid gap-4">
                                <label className="text-sm text-slate-500">
                                    Shop Location
                                    <select className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm">
                                        <option>All Locations</option>
                                        <option>Moon Tea</option>
                                        <option>Pearl Plaza</option>
                                        <option>Sunset Strip</option>
                                    </select>
                                </label>
                                <label className="text-sm text-slate-500">
                                    Receipt Image
                                    <input
                                        className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm"
                                        type="file"
                                    />
                                </label>
                                <button
                                    className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white"
                                    type="button"
                                >
                                    ⬆️ Upload &amp; Process
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-semibold">All Receipts</h3>
                            <button
                                className="rounded-full bg-orange-500 px-4 py-2 text-xs font-semibold text-white"
                                type="button"
                            >
                                Chat to Edit
                            </button>
                        </div>
                        <div className="mt-6 grid gap-4 md:grid-cols-3">
                            {receiptItems.map((receipt) => (
                                <div
                                    key={receipt.vendor}
                                    className="rounded-2xl border border-slate-100 bg-slate-50 p-4"
                                >
                                    <div className="flex h-32 items-center justify-center rounded-xl bg-gradient-to-br from-slate-200 to-slate-100 text-xs text-slate-500">
                                        Receipt Preview
                                    </div>
                                    <div className="mt-4 flex items-center justify-between">
                                        <div>
                                            <p className="font-semibold text-slate-900">
                                                {receipt.vendor}
                                            </p>
                                            <p className="text-xs text-slate-500">
                                                {receipt.location}
                                            </p>
                                        </div>
                                        <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs text-emerald-700">
                                            {receipt.tag}
                                        </span>
                                    </div>
                                    <div className="mt-3 flex items-center justify-between text-sm">
                                        <span className="text-slate-500">
                                            {receipt.date}
                                        </span>
                                        <span className="font-semibold">
                                            {receipt.total}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="space-y-8">
                    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-semibold">Edit Item</h3>
                            <button className="text-slate-400" type="button">
                                ✕
                            </button>
                        </div>
                        <div className="mt-6 space-y-4">
                            <label className="text-sm text-slate-500">
                                Shop
                                <select className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm">
                                    <option>Moon Tea</option>
                                </select>
                            </label>
                            <label className="text-sm text-slate-500">
                                Item Name
                                <input
                                    className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm"
                                    defaultValue="Sliced Limes"
                                />
                            </label>
                            <label className="text-sm text-slate-500">
                                Category
                                <select className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm">
                                    <option>Milk</option>
                                    <option>Tea Leaves</option>
                                    <option>Tapioca Pearls</option>
                                    <option>Syrups</option>
                                    <option>Toppings</option>
                                    <option>Cups</option>
                                    <option>Straws</option>
                                    <option>Lids</option>
                                    <option>Other</option>
                                </select>
                            </label>
                            <div className="grid gap-4 md:grid-cols-2">
                                <label className="text-sm text-slate-500">
                                    Current Quantity
                                    <input
                                        className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm"
                                        defaultValue="1"
                                    />
                                </label>
                                <label className="text-sm text-slate-500">
                                    Unit
                                    <input
                                        className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm"
                                        defaultValue="pcs"
                                    />
                                </label>
                            </div>
                            <label className="text-sm text-slate-500">
                                Reorder Level
                                <input
                                    className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm"
                                    defaultValue="0"
                                />
                            </label>
                            <label className="text-sm text-slate-500">
                                Cost per Unit
                                <input
                                    className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm"
                                    defaultValue="0.49"
                                />
                            </label>
                            <label className="text-sm text-slate-500">
                                Supplier
                                <input
                                    className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm"
                                    defaultValue="H-E-B"
                                />
                            </label>
                            <label className="text-sm text-slate-500">
                                Last Restock Date
                                <input
                                    className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm"
                                    defaultValue="Sep 26, 2023"
                                />
                            </label>
                            <div className="flex items-center gap-3">
                                <button
                                    className="flex-1 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white"
                                    type="button"
                                >
                                    Update Item
                                </button>
                                <button
                                    className="rounded-full bg-orange-500 px-4 py-2 text-xs font-semibold text-white"
                                    type="button"
                                >
                                    Chat to Edit
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-semibold">Inventory Items</h3>
                            <button
                                className="rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-white"
                                type="button"
                            >
                                + Add Item
                            </button>
                        </div>
                        <div className="mt-4 space-y-4 text-sm">
                            {inventoryRows.map((row) => (
                                <div
                                    key={row.item}
                                    className="grid grid-cols-[1.4fr_1fr_1fr_0.8fr] items-center gap-3 border-b border-slate-100 pb-3"
                                >
                                    <div>
                                        <p className="font-semibold text-slate-900">
                                            {row.item}
                                        </p>
                                        <p className="text-xs text-slate-500">
                                            {row.shop}
                                        </p>
                                    </div>
                                    <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-600">
                                        {row.category}
                                    </span>
                                    <span className="font-semibold text-slate-900">
                                        {row.quantity}
                                    </span>
                                    <span className="text-slate-400">
                                        {row.reorder}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            <section
                id="inventory"
                className="mx-auto grid max-w-6xl gap-8 px-6 pb-12 lg:grid-cols-[1.1fr_0.9fr]"
            >
                <div className="space-y-8">
                    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <h2 className="text-2xl font-semibold text-slate-900">
                                    Inventory
                                </h2>
                                <p className="text-sm text-slate-500">
                                    Track stock by shop with automated reorder
                                    thresholds.
                                </p>
                            </div>
                            <select className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
                                <option>All Locations</option>
                                <option>Moon Tea</option>
                                <option>Pearl Plaza</option>
                                <option>Sunset Strip</option>
                            </select>
                        </div>
                        <div className="mt-6 space-y-4">
                            {inventoryRows.map((row) => (
                                <div
                                    key={`${row.item}-inventory`}
                                    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3"
                                >
                                    <div>
                                        <p className="text-sm font-semibold text-slate-900">
                                            {row.item}
                                        </p>
                                        <p className="text-xs text-slate-500">
                                            {row.shop}
                                        </p>
                                    </div>
                                    <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-600">
                                        {row.category}
                                    </span>
                                    <span className="text-sm font-semibold text-slate-900">
                                        {row.quantity}
                                    </span>
                                    <span className="text-xs text-slate-400">
                                        Reorder at {row.reorder}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="space-y-8">
                    <div className="rounded-3xl border border-amber-100 bg-amber-50 p-6">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-semibold text-slate-900">
                                Reorder alerts
                            </h3>
                            <span className="text-xs font-semibold text-amber-700">
                                3 alerts
                            </span>
                        </div>
                        <div className="mt-4 space-y-3">
                            {lowStockAlerts.map((alert) => (
                                <div
                                    key={`${alert.item}-alert`}
                                    className="rounded-2xl border border-amber-100 bg-white px-4 py-3 text-sm"
                                >
                                    <p className="font-semibold text-slate-900">
                                        {alert.item}
                                    </p>
                                    <p className="text-xs text-slate-500">
                                        {alert.location}
                                    </p>
                                    <p className="mt-2 text-xs font-semibold text-amber-700">
                                        {alert.remaining} remaining · reorder at{' '}
                                        {alert.reorderAt}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            <section
                id="expenses"
                className="mx-auto max-w-6xl space-y-6 px-6 pb-12"
            >
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h2 className="text-2xl font-semibold text-slate-900">
                            Expenses
                        </h2>
                        <p className="text-sm text-slate-500">
                            Log vendor expenses and categorize spend by shop.
                        </p>
                    </div>
                    <button
                        className="rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-white"
                        type="button"
                    >
                        + New Expense
                    </button>
                </div>
                <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
                    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                        <h3 className="text-lg font-semibold text-slate-900">
                            Expense log
                        </h3>
                        <div className="mt-4 space-y-3">
                            {expenseEntries.map((entry) => (
                                <div
                                    key={entry.vendor}
                                    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm"
                                >
                                    <div>
                                        <p className="font-semibold text-slate-900">
                                            {entry.vendor}
                                        </p>
                                        <p className="text-xs text-slate-500">
                                            {entry.category} · {entry.location}
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sm font-semibold text-slate-900">
                                            {entry.amount}
                                        </p>
                                        <p className="text-xs text-slate-400">
                                            {entry.date}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-6">
                        <h3 className="text-lg font-semibold text-slate-900">
                            Smart expense capture
                        </h3>
                        <p className="mt-2 text-sm text-slate-600">
                            Auto-suggest categories from OCR line items and allow
                            quick overrides per location.
                        </p>
                        <div className="mt-4 space-y-3 text-sm">
                            {expenseBreakdown.map((expense) => (
                                <div
                                    key={`${expense.label}-expense`}
                                    className="flex items-center justify-between rounded-2xl border border-emerald-100 bg-white px-4 py-3"
                                >
                                    <span className="font-semibold text-slate-900">
                                        {expense.label}
                                    </span>
                                    <span className="text-emerald-700">
                                        {expense.value}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            <section className="mx-auto max-w-6xl space-y-8 px-6 pb-16">
                <div className="grid gap-6 lg:grid-cols-2">
                    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                        <h3 className="text-xl font-semibold text-slate-900">
                            Multi-location user access
                        </h3>
                        <p className="mt-2 text-sm text-slate-500">
                            Assign staff to one or more shop locations without a
                            public login. Supabase auth can be provisioned by admin
                            invite or magic links in a private setting.
                        </p>
                        <div className="mt-4 space-y-3">
                            {userRoles.map((user) => (
                                <div
                                    key={user.name}
                                    className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3"
                                >
                                    <div>
                                        <p className="text-sm font-semibold">
                                            {user.name}
                                        </p>
                                        <p className="text-xs text-slate-500">
                                            {user.role}
                                        </p>
                                    </div>
                                    <span className="text-xs font-semibold text-emerald-700">
                                        {user.locations}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                        <h3 className="text-xl font-semibold text-slate-900">
                            Cost tracking highlights
                        </h3>
                        <p className="mt-2 text-sm text-slate-500">
                            Aggregate inventory value, vendor spend, and variance
                            per location for daily reporting.
                        </p>
                        <ul className="mt-4 space-y-3 text-sm text-slate-600">
                            <li className="flex items-start gap-2">
                                <span className="mt-1 h-2 w-2 rounded-full bg-emerald-500"></span>
                                Track vendor spend from OCR line items and map to
                                ingredient categories.
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="mt-1 h-2 w-2 rounded-full bg-emerald-500"></span>
                                Update on-hand value each time inventory counts are
                                edited.
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="mt-1 h-2 w-2 rounded-full bg-emerald-500"></span>
                                Compare current costs vs targets to highlight
                                exceptions.
                            </li>
                        </ul>
                        <div className="mt-6 rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-xs text-emerald-700">
                            Sample KPI: “Pearl Plaza costs are +4.1% above target
                            due to rising tapioca prices.”
                        </div>
                    </div>
                </div>

                <div className="grid gap-6 lg:grid-cols-2">
                    <div className="rounded-3xl border border-slate-200 bg-slate-900 p-6 text-white shadow-sm">
                        <h3 className="text-lg font-semibold">
                            Supabase data model (Postgres)
                        </h3>
                        <pre className="mt-4 overflow-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-200">
                            <code>{dataModel}</code>
                        </pre>
                    </div>
                    <div className="rounded-3xl border border-slate-200 bg-slate-900 p-6 text-white shadow-sm">
                        <h3 className="text-lg font-semibold">
                            RLS policies for location access
                        </h3>
                        <pre className="mt-4 overflow-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-200">
                            <code>{supabasePolicies}</code>
                        </pre>
                    </div>
                </div>

                <div className="grid gap-6 lg:grid-cols-2">
                    <div className="rounded-3xl border border-slate-200 bg-slate-900 p-6 text-white shadow-sm">
                        <h3 className="text-lg font-semibold">
                            Vision OCR route handler (App Router)
                        </h3>
                        <pre className="mt-4 overflow-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-200">
                            <code>{visionRoute}</code>
                        </pre>
                    </div>
                    <div className="rounded-3xl border border-slate-200 bg-slate-900 p-6 text-white shadow-sm">
                        <h3 className="text-lg font-semibold">
                            Inventory cost roll-up
                        </h3>
                        <pre className="mt-4 overflow-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-200">
                            <code>{costPipeline}</code>
                        </pre>
                    </div>
                </div>

                <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                            <h3 className="text-xl font-semibold text-slate-900">
                                Next.js App Router layout example
                            </h3>
                            <p className="text-sm text-slate-500">
                                Organize receipts, inventory, and costs into route
                                groups for quick internal navigation.
                            </p>
                        </div>
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                            /app/(ops)/receipts/page.tsx
                        </span>
                    </div>
                    <pre className="mt-4 overflow-auto rounded-2xl bg-slate-900 p-4 text-xs text-slate-200">
                        <code>{appRouterExample}</code>
                    </pre>
                </div>
            </section>
        </div>
    );
}
