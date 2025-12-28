import React, { useState } from 'react';

export function Tabs({
    defaultValue,
    value,
    onValueChange,
    children,
    className = '',
}) {
    const isControlled = value !== undefined;
    const [internalValue, setInternalValue] = useState(defaultValue);
    const activeTab = isControlled ? value : internalValue;

    // Expect TabsList and TabsContent as children
    const tabsList = React.Children.toArray(children).find(
        (child) => child.type.displayName === 'TabsList'
    );
    const tabsContent = React.Children.toArray(children).filter(
        (child) => child.type.displayName === 'TabsContent'
    );

    const handleTabChange = (nextValue) => {
        if (!isControlled) {
            setInternalValue(nextValue);
        }
        onValueChange?.(nextValue);
    };

    // Clone TabsList to add props
    const tabsListWithProps = React.cloneElement(tabsList, {
        activeTab,
        onTabChange: handleTabChange,
    });

    return (
        <div className={className}>
            {tabsListWithProps}
            {tabsContent.map((tab) =>
                React.cloneElement(tab, { activeTab, key: tab.props.value })
            )}
        </div>
    );
}

export function TabsList({ children, activeTab, onTabChange, className = '' }) {
    return (
        <div className={`flex border-b ${className}`}>
            {React.Children.map(children, (child) =>
                React.cloneElement(child, { activeTab, onTabChange })
            )}
        </div>
    );
}
TabsList.displayName = 'TabsList';

export function TabsTrigger({
    value,
    children,
    activeTab,
    onTabChange,
    className = '',
}) {
    const isActive = activeTab === value;
    return (
        <button
            onClick={() => onTabChange(value)}
            className={`px-4 py-2 -mb-px border-b-2 font-semibold ${
                isActive
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-600 hover:text-gray-800'
            } ${className}`}
        >
            {children}
        </button>
    );
}
TabsTrigger.displayName = 'TabsTrigger';

export function TabsContent({ value, children, activeTab, className = '' }) {
    if (activeTab !== value) return null;
    return <div className={`p-4 ${className}`}>{children}</div>;
}
TabsContent.displayName = 'TabsContent';
