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
} from 'recharts';
import { Sun, Moon, Calendar, Thermometer, Droplets, Clock, Power } from 'lucide-react';

const App = () => {
  const [data, setData] = useState([]);
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [darkMode, setDarkMode] = useState(false);
  const [relay1On, setRelay1On] = useState(false);
  const [relay2On, setRelay2On] = useState(false);
  const [lastUpdate, setLastUpdate] = useState('N/A');

  // Fetch initial sensor and relay states
  useEffect(() => {
    async function fetchData() {
      // Get the most recent data first
      const { data: rows, error: sensorError } = await supabase
        .from('sensor_data')
        .select('temperature, humidity, inserted_at')
        .order('inserted_at', { ascending: false })
        .limit(100); // Limit to prevent loading too much data
      
      if (!sensorError && rows && rows.length > 0) {
        // Reverse to get chronological order for charting
        setData(rows.reverse());
        setLastUpdate(new Date().toLocaleTimeString());
      } else if (sensorError) {
        console.error('Error fetching sensor data:', sensorError);
      }

      // Fetch relay 1 state
      const { data: relay1Rows, error: relay1Error } = await supabase
        .from('relay_control')
        .select('state')
        .eq('id', 1)
        .single();
      
      if (!relay1Error && relay1Rows) {
        setRelay1On(relay1Rows.state);
      } else if (relay1Error) {
        console.error('Error fetching relay 1 state:', relay1Error);
        // If the relay doesn't exist, create it
        const { error: createError } = await supabase
          .from('relay_control')
          .insert([{ id: 1, state: false }]);
        if (createError) {
          console.error('Error creating relay 1:', createError);
        }
      }

      // Fetch relay 2 state
      const { data: relay2Rows, error: relay2Error } = await supabase
        .from('relay_control')
        .select('state')
        .eq('id', 2)
        .single();
      
      if (!relay2Error && relay2Rows) {
        setRelay2On(relay2Rows.state);
      } else if (relay2Error) {
        console.error('Error fetching relay 2 state:', relay2Error);
        // If the relay doesn't exist, create it
        const { error: createError } = await supabase
          .from('relay_control')
          .insert([{ id: 2, state: false }]);
        if (createError) {
          console.error('Error creating relay 2:', createError);
        }
      }
    }
    
    fetchData();

    // Set up realtime subscription
    const channel = supabase
      .channel('realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sensor_data' }, payload => {
        console.log('New sensor data received:', payload.new);
        setData(prev => {
          // Keep latest 100 entries to prevent performance issues
          const newData = [...prev, payload.new];
          if (newData.length > 100) {
            return newData.slice(-100);
          }
          return newData;
        });
        setLastUpdate(new Date().toLocaleTimeString());
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'relay_control' }, payload => {
        console.log('Relay state updated:', payload.new);
        if (payload.new.id === 1) {
          setRelay1On(payload.new.state);
        } else if (payload.new.id === 2) {
          setRelay2On(payload.new.state);
        }
      })
      .subscribe(status => {
        console.log('Supabase subscription status:', status);
      });

    // Clean up subscription on unmount
    return () => {
      console.log('Cleaning up Supabase channel');
      supabase.removeChannel(channel);
    };
  }, []);

  // Poll for updates every 30 seconds as a fallback for when realtime fails
  useEffect(() => {
    const pollInterval = setInterval(async () => {
      console.log('Polling for updates...');
      const { data: latestData, error } = await supabase
        .from('sensor_data')
        .select('temperature, humidity, inserted_at')
        .order('inserted_at', { ascending: false })
        .limit(1);
      
      if (!error && latestData && latestData.length > 0) {
        const latestTimestamp = new Date(latestData[0].inserted_at).getTime();
        const currentDataLatest = data.length > 0 ? new Date(data[data.length - 1].inserted_at).getTime() : 0;
        
        // If there's newer data than what we have, refresh all data
        if (latestTimestamp > currentDataLatest) {
          console.log('Found newer data, refreshing...');
          const { data: refreshedData, error } = await supabase
            .from('sensor_data')
            .select('temperature, humidity, inserted_at')
            .order('inserted_at', { ascending: false })
            .limit(100);
          
          if (!error && refreshedData && refreshedData.length > 0) {
            // Reverse to get chronological order for charting
            setData(refreshedData.reverse());
            setLastUpdate(new Date().toLocaleTimeString());
          }
        }
      }
      
      // Also poll for relay states to ensure they're in sync
      const { data: relay1Data, error: relay1Error } = await supabase
        .from('relay_control')
        .select('state')
        .eq('id', 1)
        .single();
        
      if (!relay1Error && relay1Data) {
        setRelay1On(relay1Data.state);
      }
      
      const { data: relay2Data, error: relay2Error } = await supabase
        .from('relay_control')
        .select('state')
        .eq('id', 2)
        .single();
        
      if (!relay2Error && relay2Data) {
        setRelay2On(relay2Data.state);
      }
      
    }, 15000); // Poll every 15 seconds for more responsiveness

    return () => clearInterval(pollInterval);
  }, [data]);

  // Toggle relay 1
  const toggleRelay1 = async () => {
    const newState = !relay1On;
    setRelay1On(newState);
    const { error } = await supabase
      .from('relay_control')
      .update({ state: newState })
      .eq('id', 1);
    
    if (error) {
      console.error('Error updating relay 1 state:', error);
      // Revert UI state if update failed
      setRelay1On(!newState);
    }
  };

  // Toggle relay 2
  const toggleRelay2 = async () => {
    const newState = !relay2On;
    setRelay2On(newState);
    const { error } = await supabase
      .from('relay_control')
      .update({ state: newState })
      .eq('id', 2);
    
    if (error) {
      console.error('Error updating relay 2 state:', error);
      // Revert UI state if update failed
      setRelay2On(!newState);
    }
  };

  // Force UI refresh every 5s
  useEffect(() => {
    const interval = setInterval(() => {
      // This will trigger a re-render without changing any data
      setLastUpdate(new Date().toLocaleTimeString());
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Take only the last 50 data points for real-time view, unless filtered by date
  const getDisplayData = () => {
    // If date filter is applied, use the filtered data
    if (startDate || endDate) {
      return data.filter(item => {
        if (!item || !item.inserted_at) return false;
        const ts = new Date(item.inserted_at);
        if (startDate && ts < startDate) return false;
        if (endDate && ts > endDate) return false;
        return true;
      });
    }
    // Otherwise, just show the most recent 50 entries for real-time view
    return data.slice(-50);
  };
  
  const filtered = getDisplayData();

  // Metrics
  const latest = filtered.length > 0 ? filtered[filtered.length - 1] : {};
  const avgTemp = filtered.length > 0
    ? (filtered.reduce((sum, d) => sum + (d.temperature || 0), 0) / filtered.length).toFixed(1)
    : '--';
  const avgHum = filtered.length > 0
    ? (filtered.reduce((sum, d) => sum + (d.humidity || 0), 0) / filtered.length).toFixed(1)
    : '--';

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
                placeholderText="Start date"
                className={`border rounded px-3 py-1.5 text-sm ${
                  darkMode 
                    ? 'bg-gray-800 text-gray-200 border-gray-700' 
                    : 'bg-white border-gray-300'
                }`}
              />
              <span className="text-xs">to</span>
              <DatePicker
                selected={endDate}
                onChange={date => setEndDate(date)}
                selectsEnd
                startDate={startDate}
                endDate={endDate}
                minDate={startDate}
                placeholderText="End date"
                className={`border rounded px-3 py-1.5 text-sm ${
                  darkMode 
                    ? 'bg-gray-800 text-gray-200 border-gray-700' 
                    : 'bg-white border-gray-300'
                }`}
              />
              {(startDate || endDate) && (
                <button 
                  onClick={() => {
                    setStartDate(null);
                    setEndDate(null);
                  }}
                  className={`px-2 py-1 rounded text-xs ${
                    darkMode 
                      ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' 
                      : 'bg-gray-100 hover:bg-gray-200 text-gray-800'
                  }`}
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="container mx-auto px-4 py-6">
        {/* Control Panel */}
        <div className="mb-6 p-4 rounded-lg bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700 flex justify-between items-center flex-wrap">
          <div className="flex items-center mb-2 sm:mb-0">
            <Clock size={20} className={darkMode ? 'text-blue-300' : 'text-blue-600'} />
            <span className="ml-2 font-medium">Last update: {lastUpdate}</span>
          </div>
          
          <button 
            onClick={async () => {
              const { data: rows, error } = await supabase
                .from('sensor_data')
                .select('temperature, humidity, inserted_at')
                .order('inserted_at', { ascending: false })
                .limit(100);
              
              if (!error && rows) {
                setData(rows.reverse());  // Reverse to get chronological order
                setLastUpdate(new Date().toLocaleTimeString());
              }
              
              // Also refresh relay states
              const { data: relay1Data } = await supabase
                .from('relay_control')
                .select('state')
                .eq('id', 1)
                .single();
                
              if (relay1Data) {
                setRelay1On(relay1Data.state);
              }
              
              const { data: relay2Data } = await supabase
                .from('relay_control')
                .select('state')
                .eq('id', 2)
                .single();
                
              if (relay2Data) {
                setRelay2On(relay2Data.state);
              }
            }}
            className={`px-3 py-1.5 rounded text-sm mr-4 ${
              darkMode 
                ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' 
                : 'bg-gray-100 hover:bg-gray-200 text-gray-800'
            }`}
          >
            Refresh Data
          </button>
          
          <div className="flex items-center space-x-4">
            <label className="flex items-center space-x-3 cursor-pointer">
              <Power size={20} className={relay1On ? 'text-green-500' : darkMode ? 'text-gray-400' : 'text-gray-500'} />
              <span className="font-medium">Relay 1</span>
              <div className="relative">
                <input
                  type="checkbox"
                  checked={relay1On}
                  onChange={toggleRelay1}
                  className="toggle-checkbox sr-only"
                  id="relay1-toggle"
                />
                <label 
                  htmlFor="relay1-toggle" 
                  className={`block w-9 h-5 border-[1px] border-black rounded-full transition-colors duration-300 ${
                    relay1On ? 'bg-green-500' : darkMode ? 'bg-gray-600' : 'bg-gray-300'
                  }`}
                >
                  <span className={`block w-4 h-4 mt-1 relative -top-[3px] bg-white rounded-full transition-transform duration-300 ${
                    relay1On ? 'transform translate-x-4' : ''
                  }`}></span>
                </label>
              </div>
            </label>
            
            <label className="flex items-center space-x-3 cursor-pointer">
              <Power size={20} className={relay2On ? 'text-green-500' : darkMode ? 'text-gray-400' : 'text-gray-500'} />
              <span className="font-medium">Relay 2</span>
              <div className="relative">
                <input
                  type="checkbox"
                  checked={relay2On}
                  onChange={toggleRelay2}
                  className="toggle-checkbox sr-only"
                  id="relay2-toggle"
                />
                <label 
                  htmlFor="relay2-toggle" 
                  className={`block w-9 h-5 border-[1px] border-black rounded-full transition-colors duration-300 ${
                    relay2On ? 'bg-green-500' : darkMode ? 'bg-gray-600' : 'bg-gray-300'
                  }`}
                >
                  <span className={`block w-4 h-4 mt-1 relative -top-[3px] bg-white rounded-full transition-transform duration-300 ${
                    relay2On ? 'transform translate-x-4' : ''
                  }`}></span>
                </label>
              </div>
            </label>
          </div>
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
          <h2 className="text-lg font-medium mb-4 flex items-center flex-wrap gap-2">
            <span className="mr-2">Sensor Data Trends</span>
            <span className={`text-xs px-2 py-1 rounded ${
              relay1On 
                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' 
                : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
            }`}>
              Relay 1: {relay1On ? 'ON' : 'OFF'}
            </span>
            <span className={`text-xs px-2 py-1 rounded ${
              relay2On 
                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' 
                : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
            }`}>
              Relay 2: {relay2On ? 'ON' : 'OFF'}
            </span>
          </h2>
          
          {data.length === 0 ? (
            <div className="h-96 flex items-center justify-center text-gray-500 dark:text-gray-400">
              No sensor data available. Check your connection to the sensor or database.
            </div>
          ) : (
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
                    tickFormatter={t => {
                      const date = new Date(t);
                      // Show date and time if filtering by date
                      if (startDate || endDate) {
                        return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
                      }
                      // Show only time for real-time view
                      return date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                    }}
                    stroke={darkMode ? '#aaa' : '#888'}
                    tick={{ fontSize: 11 }}
                    angle={-25}
                    textAnchor="end"
                    height={50}
                    dy={10}
                  />
                  <YAxis 
                    stroke={darkMode ? '#aaa' : '#888'} 
                    tick={{ fontSize: 12 }}
                    width={40}
                  />
                  <Tooltip 
                    isAnimationActive={false}
                    contentStyle={{ 
                      backgroundColor: darkMode ? '#333' : '#fff',
                      border: `1px solid ${darkMode ? '#555' : '#ddd'}`,
                      borderRadius: '4px',
                      color: darkMode ? '#eee' : '#333',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
                    }}
                    labelFormatter={value => {
                      const date = new Date(value);
                      return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
                    }}
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
                    dot={filtered.length < 10}
                    activeDot={{ r: 6, strokeWidth: 0 }}
                    isAnimationActive={false}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="humidity" 
                    name="Humidity"
                    stroke="#60a5fa" 
                    strokeWidth={2}
                    fill="url(#colorHum)" 
                    dot={filtered.length < 10}
                    activeDot={{ r: 6, strokeWidth: 0 }}
                    isAnimationActive={false}
                  />
                  <Legend 
                    iconType="circle" 
                    verticalAlign="top"
                    wrapperStyle={{ paddingBottom: '10px' }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </main>
      
      {/* Footer */}
      <footer className={`mt-8 py-4 text-center text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
        Sensor Dashboard • Data updates in real-time • Last refresh: {lastUpdate}
      </footer>
    </div>
  );
};

export default App;