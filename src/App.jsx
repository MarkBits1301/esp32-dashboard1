import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ReferenceLine,
  Brush,
} from 'recharts';
import { Sun, Moon, Calendar, Thermometer, Droplets, Clock, Power } from 'lucide-react';

const App = () => {
  const [data, setData] = useState([]);
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [darkMode, setDarkMode] = useState(false);
  const [relayOn, setRelayOn] = useState(false);

  // Fetch initial sensor and relay state
  useEffect(() => {
    async function fetchData() {
      const { data: rows, error: sensorError } = await supabase
        .from('sensor_data')
        .select('temperature, humidity, inserted_at')
        .order('inserted_at', { ascending: true });
      if (!sensorError) setData(rows || []);

      const { data: relayRows, error: relayError } = await supabase
        .from('relay_control')
        .select('state')
        .eq('id', 1)
        .single();
      if (!relayError && relayRows) setRelayOn(relayRows.state);
    }
    fetchData();

    const channel = supabase
      .channel('realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sensor_data' }, payload => {
        setData(prev => [...prev.slice(-59), payload.new]);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'relay_control' }, payload => {
        setRelayOn(payload.new.state);
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  // Force update every second
  useEffect(() => {
    const interval = setInterval(() => setData(prev => [...prev]), 1000);
    return () => clearInterval(interval);
  }, []);

  // Toggle relay
  const toggleRelay = async () => {
    const newState = !relayOn;
    setRelayOn(newState);
    await supabase
      .from('relay_control')
      .update({ state: newState })
      .eq('id', 1);
  };

  // Filter data
  const filtered = data.filter(item => {
    const ts = new Date(item.inserted_at);
    if (startDate && ts < startDate) return false;
    if (endDate && ts > endDate) return false;
    return true;
  });

  // Metrics
  const latest = filtered[filtered.length - 1] || {};
  const avgTemp = (filtered.reduce((sum, d) => sum + d.temperature, 0) / (filtered.length || 1)).toFixed(1);
  const avgHum = (filtered.reduce((sum, d) => sum + d.humidity, 0) / (filtered.length || 1)).toFixed(1);

  // Theme class to apply to html element
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-100 transition-colors duration-300">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center">
            <button
              onClick={() => setDarkMode(!darkMode)}
              className={`p-2 rounded-full transition-colors ${
                darkMode 
                  ? 'bg-gray-700 hover:bg-gray-600 text-yellow-300' 
                  : 'bg-gray-100 hover:bg-gray-200 text-indigo-600'
              }`}
              aria-label="Toggle dark mode"
            >
              {darkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            
            <h1 className="ml-4 text-lg font-semibold">Sensor Dashboard</h1>
          </div>
          
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Calendar size={16} className={darkMode ? 'text-gray-300' : 'text-gray-500'} />
              <DatePicker
                selected={startDate}
                onChange={date => setStartDate(date)}
                selectsStart
                startDate={startDate}
                endDate={endDate}
                placeholderText="Filter by date"
                className={`border rounded px-3 py-1.5 text-sm ${
                  darkMode 
                    ? 'bg-gray-800 text-gray-200 border-gray-700' 
                    : 'bg-white border-gray-300'
                }`}
              />
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="container mx-auto px-4 py-6">
        {/* Control Panel */}
        <div className="mb-6 p-4 rounded-lg bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700 flex justify-between items-center">
          <div className="flex items-center">
            <Clock size={20} className={darkMode ? 'text-blue-300' : 'text-blue-600'} />
            <span className="ml-2 font-medium">Last update: {latest.inserted_at ? new Date(latest.inserted_at).toLocaleTimeString() : 'N/A'}</span>
          </div>
          
          <label className="flex items-center space-x-3 cursor-pointer">
            <Power size={20} className={relayOn ? 'text-green-500' : darkMode ? 'text-gray-400' : 'text-gray-500'} />
            <span className="font-medium">Control Relay</span>
            <div className="relative">
              <input
                type="checkbox"
                checked={relayOn}
                onChange={toggleRelay}
                className="toggle-checkbox sr-only"
                id="relay-toggle"
              />
              <label 
                htmlFor="relay-toggle" 
                className={`block w-12 h-6 rounded-full transition-colors duration-300 ${
                  relayOn ? 'bg-green-500' : darkMode ? 'bg-gray-600' : 'bg-gray-300'
                }`}
              >
                <span className={`block w-4 h-4 mt-1 ml-1 bg-white rounded-full transition-transform duration-300 ${
                  relayOn ? 'transform translate-x-6' : ''
                }`}></span>
              </label>
            </div>
          </label>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="p-4 rounded-lg shadow-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-16 h-16 -mt-6 -mr-6 rounded-full bg-pink-100 opacity-60 dark:opacity-10"></div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Current Temp</h3>
              <Thermometer size={18} className="text-pink-500" />
            </div>
            <p className="text-2xl font-bold text-pink-600 dark:text-pink-400">{latest.temperature?.toFixed(1) || '--'}°C</p>
          </div>
          
          <div className="p-4 rounded-lg shadow-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-16 h-16 -mt-6 -mr-6 rounded-full bg-blue-100 opacity-60 dark:opacity-10"></div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Current Humidity</h3>
              <Droplets size={18} className="text-blue-500" />
            </div>
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{latest.humidity?.toFixed(1) || '--'}%</p>
          </div>
          
          <div className="p-4 rounded-lg shadow-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-16 h-16 -mt-6 -mr-6 rounded-full bg-green-100 opacity-60 dark:opacity-10"></div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Avg Temp</h3>
              <Thermometer size={18} className="text-green-500" />
            </div>
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">{avgTemp}°C</p>
          </div>
          
          <div className="p-4 rounded-lg shadow-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-16 h-16 -mt-6 -mr-6 rounded-full bg-yellow-100 opacity-60 dark:opacity-10"></div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Avg Humidity</h3>
              <Droplets size={18} className="text-yellow-500" />
            </div>
            <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{avgHum}%</p>
          </div>
        </div>

        {/* Chart */}
        <div className="p-4 rounded-lg shadow-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-medium mb-4 flex items-center">
            <span className="mr-2">Sensor Data Trends</span>
            <span className={`text-xs px-2 py-1 rounded ${
              relayOn 
                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' 
                : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
            }`}>
              Relay: {relayOn ? 'ON' : 'OFF'}
            </span>
          </h2>
          
          <div className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart 
                data={filtered.length ? filtered : data} 
                margin={{ top: 10, right: 10, left: 0, bottom: 20 }}
              >
                <defs>
                  <linearGradient id="colorTemp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#c084fc" stopOpacity={0.6} />
                    <stop offset="95%" stopColor="#c084fc" stopOpacity={0.1} />
                  </linearGradient>
                  <linearGradient id="colorHum" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.6} />
                    <stop offset="95%" stopColor="#60a5fa" stopOpacity={0.1} />
                  </linearGradient>
                </defs>
                <CartesianGrid 
                  strokeDasharray="3 3" 
                  stroke={darkMode ? '#333' : '#f0f0f0'} 
                  vertical={false} 
                />
                <XAxis 
                  dataKey="inserted_at" 
                  tickFormatter={t => new Date(t).toLocaleTimeString()} 
                  stroke={darkMode ? '#aaa' : '#888'}
                  tick={{ fontSize: 12 }}
                  dy={10}
                />
                <YAxis 
                  stroke={darkMode ? '#aaa' : '#888'} 
                  tick={{ fontSize: 12 }}
                  width={40}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: darkMode ? '#333' : '#fff',
                    border: `1px solid ${darkMode ? '#555' : '#ddd'}`,
                    borderRadius: '4px',
                    color: darkMode ? '#eee' : '#333',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
                  }}
                  labelFormatter={value => new Date(value).toLocaleString()}
                  formatter={(value, name) => [
                    value.toFixed(1) + (name === 'temperature' ? '°C' : '%'), 
                    name === 'temperature' ? 'Temperature' : 'Humidity'
                  ]}
                />
                <ReferenceLine 
                  y={30} 
                  stroke={darkMode ? '#ff6b6b99' : '#ff7f7f'} 
                  strokeDasharray="3 3" 
                  label={{ 
                    value: 'Threshold', 
                    position: 'insideBottomRight',
                    fill: darkMode ? '#ff6b6b' : '#ff7f7f',
                    fontSize: 12
                  }} 
                />
                <Area 
                  type="monotone" 
                  dataKey="temperature" 
                  name="Temperature"
                  stroke="#c084fc" 
                  strokeWidth={2}
                  fill="url(#colorTemp)" 
                  dot={false}
                  activeDot={{ r: 6, strokeWidth: 0 }}
                />
                <Area 
                  type="monotone" 
                  dataKey="humidity" 
                  name="Humidity"
                  stroke="#60a5fa" 
                  strokeWidth={2}
                  fill="url(#colorHum)" 
                  dot={false}
                  activeDot={{ r: 6, strokeWidth: 0 }}
                />
                <Brush 
                  dataKey="inserted_at" 
                  height={30} 
                  stroke={darkMode ? '#666' : '#ddd'}
                  fill={darkMode ? '#333' : '#f9f9f9'}
                  tickFormatter={t => new Date(t).toLocaleTimeString()} 
                  startIndex={Math.max(0, data.length - 30)}
                />
                <Legend 
                  iconType="circle" 
                  verticalAlign="top"
                  wrapperStyle={{ paddingBottom: '10px' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </main>
      
      {/* Footer */}
      <footer className={`mt-8 py-4 text-center text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
        Sensor Dashboard • Data updates in real-time
      </footer>
    </div>
  );
};

export default App;