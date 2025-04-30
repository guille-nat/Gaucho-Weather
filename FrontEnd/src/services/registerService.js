import api from "./apiService";

export const registerUser = async (email, username, password, first_name,last_name) =>{
    try {
        const response = await api.post("/users/register",{
            email:email,
            username:username,
            password:password,
            first_name:first_name,
            last_name:last_name
        })
        return response
    } catch (error) {
        return error
    }
}   


