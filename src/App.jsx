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
import { Sun, Moon, Calendar, Thermometer, Clock, Power, Sliders, RefreshCw } from 'lucide-react';

const App = () => {
  const [data, setData] = useState([]);
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [darkMode, setDarkMode] = useState(false);
  const [relay1On, setRelay1On] = useState(false);
  const [relay2On, setRelay2On] = useState(false);
  const [lastUpdate, setLastUpdate] = useState('N/A');
  const [automaticMode, setAutomaticMode] = useState(true);

  // Fetch initial sensor data, relay states, and system mode
  useEffect(() => {
    async function fetchData() {
      // Get the last 24 hours of data
      const twentyFourHoursAgo = new Date();
      twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);
      
      const { data: rows, error: sensorError } = await supabase
        .from('sensor_data')
        .select('temperature, inserted_at')
        .gte('inserted_at', twentyFourHoursAgo.toISOString())
        .order('inserted_at', { ascending: true });
      
      if (!sensorError && rows && rows.length > 0) {
        setData(rows);
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

      // Fetch system mode (automatic/manual)
      const { data: modeData, error: modeError } = await supabase
        .from('system_settings')
        .select('automatic_mode')
        .eq('id', 1)
        .single();
      
      if (!modeError && modeData) {
        setAutomaticMode(modeData.automatic_mode);
      } else if (modeError) {
        console.error('Error fetching system mode:', modeError);
        // If the setting doesn't exist, create it
        const { error: createError } = await supabase
          .from('system_settings')
          .insert([{ id: 1, automatic_mode: true }]);
        if (createError) {
          console.error('Error creating system mode setting:', createError);
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
          // Add the new data point
          const newData = [...prev, payload.new];
          
          // Keep only data from the last 24 hours
          const twentyFourHoursAgo = new Date();
          twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);
          return newData.filter(item => new Date(item.inserted_at) >= twentyFourHoursAgo);
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
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'system_settings' }, payload => {
        console.log('System mode updated:', payload.new);
        if (payload.new.id === 1) {
          setAutomaticMode(payload.new.automatic_mode);
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

  // Poll for updates every 15 seconds as a fallback for when realtime fails
  useEffect(() => {
    const pollInterval = setInterval(async () => {
      console.log('Polling for updates...');
      
      // Get the last 24 hours of data
      const twentyFourHoursAgo = new Date();
      twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);
      
      const { data: latestData, error } = await supabase
        .from('sensor_data')
        .select('temperature, inserted_at')
        .order('inserted_at', { ascending: false })
        .limit(1);
      
      if (!error && latestData && latestData.length > 0) {
        const latestTimestamp = new Date(latestData[0].inserted_at).getTime();
        const currentDataLatest = data.length > 0 ? new Date(data[data.length - 1].inserted_at).getTime() : 0;
        
        // If there's newer data than what we have, refresh all data from the last 24 hours
        if (latestTimestamp > currentDataLatest) {
          console.log('Found newer data, refreshing...');
          const { data: refreshedData, error } = await supabase
            .from('sensor_data')
            .select('temperature, inserted_at')
            .gte('inserted_at', twentyFourHoursAgo.toISOString())
            .order('inserted_at', { ascending: true });
          
          if (!error && refreshedData && refreshedData.length > 0) {
            setData(refreshedData);
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

      // Poll for system mode
      const { data: modeData, error: modeError } = await supabase
        .from('system_settings')
        .select('automatic_mode')
        .eq('id', 1)
        .single();
        
      if (!modeError && modeData) {
        setAutomaticMode(modeData.automatic_mode);
      }
      
    }, 15000); // Poll every 15 seconds for more responsiveness

    return () => clearInterval(pollInterval);
  }, [data]);

  // Toggle relay 1
  const toggleRelay1 = async () => {
    // Only allow toggling if in manual mode
    if (automaticMode) {
      alert("Cannot toggle relays in Automatic mode. Switch to Manual mode first.");
      return;
    }
    
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
    // Only allow toggling if in manual mode
    if (automaticMode) {
      alert("Cannot toggle relays in Automatic mode. Switch to Manual mode first.");
      return;
    }
    
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

  // Toggle system mode
  const toggleMode = async () => {
    const newMode = !automaticMode;
    setAutomaticMode(newMode);
    const { error } = await supabase
      .from('system_settings')
      .update({ automatic_mode: newMode })
      .eq('id', 1);
    
    if (error) {
      console.error('Error updating system mode:', error);
      // Revert UI state if update failed
      setAutomaticMode(!newMode);
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

  // Filter data based on date range if specified
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
    // Otherwise, show all the data (which is already limited to 24 hours)
    return data;
  };
  
  const filtered = getDisplayData();

  // Metrics
  const latest = filtered.length > 0 ? filtered[filtered.length - 1] : {};
  const avgTemp = filtered.length > 0
    ? (filtered.reduce((sum, d) => sum + (d.temperature || 0), 0) / filtered.length).toFixed(1)
    : '--';

  // Theme class to apply to html element
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // Function to check if temperature is in specific range
  const isInRelayRange = (temp, relayNum) => {
    if (relayNum === 1) {
      return temp >= 0 && temp <= 10;
    } else if (relayNum === 2) {
      return temp >= 11 && temp <= 20;
    }
    return false;
  };

  // Get the current temperature's status for UI highlighting
  const currentTemp = latest.temperature || 0;
  const inRelay1Range = isInRelayRange(currentTemp, 1);
  const inRelay2Range = isInRelayRange(currentTemp, 2);
  
  // Determine why relays are on/off for status display
  const getRelayStatus = (relayNum, isOn) => {
    if (!automaticMode) {
      return isOn ? "ON (Manual)" : "OFF (Manual)";
    }
    
    const inRange = relayNum === 1 ? inRelay1Range : inRelay2Range;
    if (isOn) {
      return inRange ? "ON (Auto: In Range)" : "ON (Manual Override)";
    } else {
      return inRange ? "OFF (Malfunction?)" : "OFF (Auto: Out of Range)";
    }
  };

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
            
            <h1 className="ml-4 text-lg font-semibold">PT100 Temperature Monitor</h1>
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
        {/* System Mode & Control Panel */}
        <div className="mb-6 p-4 rounded-lg bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4">
            <div className="flex items-center mb-4 md:mb-0">
              <Sliders size={20} className={darkMode ? 'text-blue-300' : 'text-blue-600'} />
              <span className="ml-2 text-lg font-medium">System Mode:</span>
              <span className={`ml-2 px-3 py-1 rounded text-sm font-medium ${
                automaticMode 
                  ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' 
                  : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300'
              }`}>
                {automaticMode ? 'AUTOMATIC' : 'MANUAL'}
              </span>
              <button 
                onClick={toggleMode}
                className={`ml-4 px-3 py-1.5 rounded text-sm ${
                  darkMode 
                    ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                    : 'bg-blue-500 hover:bg-blue-600 text-white'
                }`}
              >
                Switch Mode
              </button>
            </div>
            
            <div className="flex items-center">
              <Clock size={20} className={darkMode ? 'text-blue-300' : 'text-blue-600'} />
              <span className="ml-2 font-medium">Last update: {lastUpdate}</span>
              <button 
                onClick={async () => {
                  // Get the last 24 hours of data
                  const twentyFourHoursAgo = new Date();
                  twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);
                  
                  const { data: rows, error } = await supabase
                    .from('sensor_data')
                    .select('temperature, inserted_at')
                    .gte('inserted_at', twentyFourHoursAgo.toISOString())
                    .order('inserted_at', { ascending: true });
                  
                  if (!error && rows) {
                    setData(rows);
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

                  // Also refresh system mode
                  const { data: modeData } = await supabase
                    .from('system_settings')
                    .select('automatic_mode')
                    .eq('id', 1)
                    .single();
                    
                  if (modeData) {
                    setAutomaticMode(modeData.automatic_mode);
                  }
                }}
                className={`ml-4 p-2 rounded-full ${
                  darkMode 
                    ? 'bg-gray-700 hover:bg-gray-600 text-blue-300' 
                    : 'bg-gray-100 hover:bg-gray-200 text-blue-600'
                }`}
                aria-label="Refresh data"
              >
                <RefreshCw size={18} />
              </button>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div className={`p-4 rounded-lg border ${
              relay1On 
                ? 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800' 
                : 'bg-gray-50 border-gray-200 dark:bg-gray-800 dark:border-gray-700'
            }`}>
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="font-medium">Relay 1 (0°C to 10°C)</h3>
                  <p className="text-sm mt-1">
                    {getRelayStatus(1, relay1On)}
                  </p>
                  {automaticMode && inRelay1Range && (
                    <p className="text-sm mt-1 text-green-600 dark:text-green-400">
                      Current temp: {currentTemp.toFixed(1)}°C (in range)
                    </p>
                  )}
                </div>
                <div className="flex items-center">
                  <Power size={20} className={relay1On ? 'text-green-500' : darkMode ? 'text-gray-400' : 'text-gray-500'} />
                  <div className="relative ml-2">
                    <input
                      type="checkbox"
                      checked={relay1On}
                      onChange={toggleRelay1}
                      disabled={automaticMode}
                      className="toggle-checkbox sr-only"
                      id="relay1-toggle"
                    />
                    <label 
                      htmlFor="relay1-toggle" 
                      className={`block w-9 h-5 border-[1px] border-black rounded-full transition-colors duration-300 ${
                        automaticMode ? 'opacity-50 cursor-not-allowed ' : 'cursor-pointer '
                      }${relay1On ? 'bg-green-500' : darkMode ? 'bg-gray-600' : 'bg-gray-300'}`}
                    >
                      <span className={`block w-4 h-4 mt-1 relative -top-[3px] bg-white rounded-full transition-transform duration-300 ${
                        relay1On ? 'transform translate-x-4' : ''
                      }`}></span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
            
            <div className={`p-4 rounded-lg border ${
              relay2On 
                ? 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800' 
                : 'bg-gray-50 border-gray-200 dark:bg-gray-800 dark:border-gray-700'
            }`}>
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="font-medium">Relay 2 (11°C to 20°C)</h3>
                  <p className="text-sm mt-1">
                    {getRelayStatus(2, relay2On)}
                  </p>
                  {automaticMode && inRelay2Range && (
                    <p className="text-sm mt-1 text-green-600 dark:text-green-400">
                      Current temp: {currentTemp.toFixed(1)}°C (in range)
                    </p>
                  )}
                </div>
                <div className="flex items-center">
                  <Power size={20} className={relay2On ? 'text-green-500' : darkMode ? 'text-gray-400' : 'text-gray-500'} />
                  <div className="relative ml-2">
                    <input
                      type="checkbox"
                      checked={relay2On}
                      onChange={toggleRelay2}
                      disabled={automaticMode}
                      className="toggle-checkbox sr-only"
                      id="relay2-toggle"
                    />
                    <label 
                      htmlFor="relay2-toggle" 
                      className={`block w-9 h-5 border-[1px] border-black rounded-full transition-colors duration-300 ${
                        automaticMode ? 'opacity-50 cursor-not-allowed ' : 'cursor-pointer '
                      }${relay2On ? 'bg-green-500' : darkMode ? 'bg-gray-600' : 'bg-gray-300'}`}
                    >
                      <span className={`block w-4 h-4 mt-1 relative -top-[3px] bg-white rounded-full transition-transform duration-300 ${
                        relay2On ? 'transform translate-x-4' : ''
                      }`}></span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Temperature Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="p-4 rounded-lg shadow-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-16 h-16 -mt-6 -mr-6 rounded-full bg-pink-100 opacity-60 dark:opacity-10"></div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Current Temperature</h3>
              <Thermometer size={18} className="text-pink-500" />
            </div>
            <p className="text-2xl font-bold text-pink-600 dark:text-pink-400">{latest.temperature?.toFixed(1) || '--'}°C</p>
            <p className="mt-2 text-sm">
              {inRelay1Range && 'In Relay 1 range (0-10°C)'}
              {inRelay2Range && 'In Relay 2 range (11-20°C)'}
              {!inRelay1Range && !inRelay2Range && 'Outside control ranges'}
            </p>
          </div>
          
          <div className="p-4 rounded-lg shadow-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-16 h-16 -mt-6 -mr-6 rounded-full bg-green-100 opacity-60 dark:opacity-10"></div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Avg Temp (24h)</h3>
              <Thermometer size={18} className="text-green-500" />
            </div>
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">{avgTemp}°C</p>
          </div>
          
          <div className="p-4 rounded-lg shadow-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-16 h-16 -mt-6 -mr-6 rounded-full bg-blue-100 opacity-60 dark:opacity-10"></div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Control Ranges</h3>
              <Sliders size={18} className="text-blue-500" />
            </div>
            <div className="space-y-2 mt-1">
              <div className="flex items-center">
                <div className={`w-3 h-3 rounded-full ${relay1On ? 'bg-green-500' : 'bg-gray-400'} mr-2`}></div>
                <span className="text-sm">Relay 1: 0°C to 10°C</span>
              </div>
              <div className="flex items-center">
                <div className={`w-3 h-3 rounded-full ${relay2On ? 'bg-green-500' : 'bg-gray-400'} mr-2`}></div>
                <span className="text-sm">Relay 2: 11°C to 20°C</span>
              </div>
            </div>
          </div>
        </div>

        {/* Chart */}
        <div className="p-4 rounded-lg shadow-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-medium mb-4">Temperature Trends</h2>
          
          {data.length === 0 ? (
            <div className="h-96 flex items-center justify-center text-gray-500 dark:text-gray-400">
              No temperature data available. Check your sensor connection or database.
            </div>
          ) : (
            <div className="h-96">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={filtered}>
                  <defs>
                    <linearGradient id="tempGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={darkMode ? "#6366f1" : "#818cf8"} stopOpacity={0.8} />
                      <stop offset="95%" stopColor={darkMode ? "#6366f1" : "#818cf8"} stopOpacity={0.2} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? "#374151" : "#e5e7eb"} />
                  <XAxis 
                    dataKey="inserted_at" 
                    tick={{ fill: darkMode ? "#9ca3af" : "#4b5563" }}
                    tickFormatter={timestamp => {
                      const date = new Date(timestamp);
                      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    }}
                    interval="preserveStartEnd"
                    minTickGap={60}
                  />
                  <YAxis 
                    tick={{ fill: darkMode ? "#9ca3af" : "#4b5563" }}
                    domain={['auto', 'auto']}
                    label={{ 
                      value: 'Temperature (°C)', 
                      angle: -90, 
                      position: 'insideLeft',
                      style: { fill: darkMode ? "#9ca3af" : "#4b5563" }
                    }}
                  />
                  <Tooltip 
                    formatter={(value) => [`${value.toFixed(1)}°C`, 'Temperature']}
                    labelFormatter={(timestamp) => {
                      const date = new Date(timestamp);
                      return date.toLocaleString();
                    }}
                    contentStyle={{ 
                      backgroundColor: darkMode ? "#1f2937" : "#ffffff",
                      border: `1px solid ${darkMode ? "#374151" : "#e5e7eb"}`,
                      color: darkMode ? "#f3f4f6" : "#1f2937"
                    }}
                  />
                  <Legend />
                  
                  {/* Temperature range reference lines */}
                  <ReferenceLine y={0} stroke="#10b981" strokeDasharray="3 3" label={{ 
                    value: 'Relay 1 Min', 
                    position: 'insideTopLeft',
                    fill: darkMode ? "#d1fae5" : "#047857",
                    fontSize: 10 
                  }} />
                  <ReferenceLine y={10} stroke="#10b981" strokeDasharray="3 3" label={{ 
                    value: 'Relay 1 Max', 
                    position: 'insideTopLeft',
                    fill: darkMode ? "#d1fae5" : "#047857",
                    fontSize: 10 
                  }} />
                  <ReferenceLine y={11} stroke="#3b82f6" strokeDasharray="3 3" label={{ 
                    value: 'Relay 2 Min', 
                    position: 'insideTopLeft',
                    fill: darkMode ? "#bfdbfe" : "#1e40af",
                    fontSize: 10 
                  }} />
                  <ReferenceLine y={20} stroke="#3b82f6" strokeDasharray="3 3" label={{ 
                    value: 'Relay 2 Max', 
                    position: 'insideTopLeft',
                    fill: darkMode ? "#bfdbfe" : "#1e40af",
                    fontSize: 10 
                  }} />
                  
                  <Area 
                    type="monotone" 
                    dataKey="temperature" 
                    stroke={darkMode ? "#818cf8" : "#4f46e5"} 
                    fillOpacity={1} 
                    fill="url(#tempGradient)" 
                    name="Temperature"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
          
          <div className="mt-4 text-sm text-gray-500 dark:text-gray-400">
            {filtered.length > 0 ? (
              <p>
                Showing {filtered.length} data point{filtered.length !== 1 ? 's' : ''} from {
                  new Date(filtered[0].inserted_at).toLocaleString()
                } to {
                  new Date(filtered[filtered.length - 1].inserted_at).toLocaleString()
                }
              </p>
            ) : null}
          </div>
        </div>
        
        {/* Data Table (collapsible) */}
        <div className="mt-6 p-4 rounded-lg shadow-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
          <details>
            <summary className="cursor-pointer text-lg font-medium focus:outline-none">
              Raw Temperature Data
            </summary>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead>
                  <tr>
                    <th className="px-6 py-3 bg-gray-50 dark:bg-gray-900 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Time</th>
                    <th className="px-6 py-3 bg-gray-50 dark:bg-gray-900 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Temperature (°C)</th>
                    <th className="px-6 py-3 bg-gray-50 dark:bg-gray-900 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Control Status</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {filtered.slice(-20).reverse().map((item, index) => {
                    const temp = item.temperature || 0;
                    const inRelay1Range = isInRelayRange(temp, 1);
                    const inRelay2Range = isInRelayRange(temp, 2);
                    
                    return (
                      <tr key={index} className={index % 2 === 0 ? 'bg-gray-50 dark:bg-gray-900/50' : ''}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {new Date(item.inserted_at).toLocaleString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`text-sm font-medium ${
                            inRelay1Range 
                              ? 'text-green-600 dark:text-green-400' 
                              : inRelay2Range 
                                ? 'text-blue-600 dark:text-blue-400'
                                : 'text-gray-800 dark:text-gray-200'
                          }`}>
                            {temp.toFixed(1)}°C
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {inRelay1Range && (
                            <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">
                              Relay 1 Range (0-10°C)
                            </span>
                          )}
                          {inRelay2Range && (
                            <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300">
                              Relay 2 Range (11-20°C)
                            </span>
                          )}
                          {!inRelay1Range && !inRelay2Range && (
                            <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">
                              Outside Control Range
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filtered.length > 20 && (
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                  Showing only the last 20 records. {filtered.length - 20} more record(s) available.
                </p>
              )}
            </div>
          </details>
        </div>
      </main>
      
      {/* Footer */}
      <footer className="mt-8 py-4 border-t border-gray-200 dark:border-gray-700">
        <div className="container mx-auto px-4 text-center text-sm text-gray-500 dark:text-gray-400">
          <p>PT100 Temperature Monitoring System &copy; {new Date().getFullYear()}</p>
          <p className="mt-1">Built with React and Supabase</p>
        </div>
      </footer>
    </div>
  );
};

export default App;