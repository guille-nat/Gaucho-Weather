import {createSlice} from "@reduxjs/toolkit";

// Estado inicial
const initialState = {
    favoriteLocation: JSON.parse(window.localStorage.getItem('favoriteLocation')) || [],
<<<<<<< HEAD
    preferredUnits: window.localStorage.getItem('preferredUnits') || null,
    alertsEnabled: window.localStorage.getItem('alertsEnabled') || null,
=======
    preferredUnits: window.localStorage.getItem('preferredUnits') || "metric",
    alertsEnabled: window.localStorage.getItem('alertsEnabled') || false,
>>>>>>> 4957e5227bf302910829f85454d42ff1f85d815b
};

// Slice de Redux
const userPreferencesSlice = createSlice({
    name: "userPreferences",
    initialState,
    reducers: {
        setPreferences: (state, action) =>{
            const {favoriteLocation,preferredUnits ,alertsEnabled }= action.payload
            state.favoriteLocation =  favoriteLocation;
            state.preferredUnits =preferredUnits;
            state.alertsEnabled = alertsEnabled
            window.localStorage.setItem('favoriteLocation', JSON.stringify(favoriteLocation));
            window.localStorage.setItem('preferredUnits',preferredUnits)
            window.localStorage.setItem('alertsEnabled',alertsEnabled)
        },
        clearPreferences: (state) => {
            state.favoriteLocation = [];
            state.preferredUnits = 'metric';
            state.alertsEnabled = 'false';
            window.localStorage.removeItem('alertsEnabled');
            window.localStorage.removeItem('favoriteLocation');
            window.localStorage.removeItem('preferredUnits');
        },
    },
});
export const { setPreferences, clearPreferences } = userPreferencesSlice.actions;
export default userPreferencesSlice.reducer;