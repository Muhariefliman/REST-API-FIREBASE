const express = require('express');
const admin = require('firebase-admin');
const firebase = require('firebase');
const multer = require('multer');
const app = express();
const upload = multer({storage: multer.memoryStorage()});
const bodyParser = require('body-parser');
const cors = require('cors');


app.use(bodyParser.json());
app.use(cors());
app.use(express.static('public'));

const adminConfig = require('./services.json');
admin.initializeApp({
    credential: admin.credential.cert(adminConfig),
    storageBucket: "gs://fir-api-3f3f7.appspot.com"
});

const firebaseConfig = {
    apiKey: "AIzaSyBM9d8O7_R3QlFVWgaICjgFOxRK-BY3vco",
    authDomain: "fir-api-3f3f7.firebaseapp.com",
    projectId: "fir-api-3f3f7",
    storageBucket: "fir-api-3f3f7.appspot.com",
    messagingSenderId: "895156576323",
    appId: "1:895156576323:web:e59bb2fcc646470ebc34f6"
};
const FB = firebase.initializeApp(firebaseConfig);
app.locals.bucket = admin.storage().bucket();


app.listen(3000, () => {console.log('Server is running on port 3000')});

app.get('/', (req, res) => {
    res.send('Hello World!');
});


const uploadFile = async (file, fileName) => {
    const data = await app.locals.bucket.file(fileName).createWriteStream().end(file.buffer);
}

const getStorageURL = async (path) => {
    return await firebase.storage().refFromURL(path).getDownloadURL()
}

const wrapper = (status, payload, code) => {
    return {
        "status": status,
        "data": payload,
        "code": code
    }
};

// const getUser = async () => {return await FB.auth().currentUser};

app.post('/users/create', upload.single('file'), async (req, res) => {
    try {
        const file = req.file;
        const { email, password, name, ttl, gender } = req.body;
        // console.log(file);
        const user = await FB.auth().createUserWithEmailAndPassword(email, password);

        const data_firestore = await FB.firestore().collection("Users").doc(user.user.uid).set({name, ttl, gender});
        
        // console.log(user.user.uid);    
        const fileName = user.user.uid + '.' + file.originalname.split('.')[1];
        await uploadFile(file, fileName);
        await FB.auth().currentUser.updateProfile({photoURL: 'gs://fir-api-3f3f7.appspot.com/'+fileName});
        res.send(wrapper("success", user.user, 200));
    } catch (error) {
        res.send(wrapper("error", error.message, 500));
    }
});

app.post('/users/login', upload.any(), async (req, res) => {
    try {
        const { email, password } = req.body;
        // console.log(req.body);
        await FB.auth().signInWithEmailAndPassword(email, password);
        const nowUser = await FB.auth().currentUser;
        const token = await nowUser.getIdToken();
        const data = {
            'token' : token,
        }
        res.send(wrapper("success", data, 200));
    } catch (error) {
        res.send(wrapper("error", error.message, 500));
    }
})

const AuthUser = async (req, res, next) => {
    // console.log(req.header.authorization);
    // var host = req.headers['authorization']; 
    // // console.log(host);
    const token = req.headers.authorization.split(' ')[1];
    if(!token) res.send("No Token Available");
    try {
        admin.auth().verifyIdToken(token).then((decodedToken) => {
            next();
          }).catch((error) => {
            return res.send(wrapper("error", error.message, 500));
          });
    } catch (error) {
        res.send(wrapper("error", error.message, 500));
    }
};

app.get('/users/profile', AuthUser, async (req, res) => {
    // console.log(req.header.authorization);
    try {
        const user = await FB.auth().currentUser;
        if(!user) return res.send(wrapper("error", "No User Available", 500));
        const profile = await getStorageURL(user.photoURL);
        const data_firestore = await FB.firestore().collection("Users").doc(user.uid).get();

        const data = {
            'email': user.email,
            'picture': profile,
            'name': data_firestore.data().name,
            'ttl': data_firestore.data().ttl,
            'gender': data_firestore.data().gender
        }
        res.send(wrapper("success", data, 200));
    }catch(error) {
        res.send(wrapper("failed", error.message, 500));
    }
});

app.post('/users/editProfile', upload.any(), async(req, res)=>{
    try {
        const user = await FB.auth().currentUser;
        if(!user) return res.send(wrapper("error", "No User Available", 500));
        const { email, password, name, ttl, gender } = req.body;
        if(email) await user.updateEmail(email).then(()=> user.sendEmailVerification()).catch((error) => res.send(wrapper("failed", error.message, 500)));
        if(password) await user.updatePassword(password).then(()=>{}).catch((error) => res.send(wrapper("failed", error.message, 500)));

        const data = await FB.firestore().collection("Users").doc(user.uid).get();

        const dataUpdate = {
            'name': (name) ? name : data.data().name,
            'ttl': (ttl) ? ttl : data.data().ttl,
            'gender': (gender)? gender: data.data().gender
        }

        await FB.firestore().collection("Users").doc(user.uid).update(dataUpdate);
        res.send(wrapper("Success", "Success Update Profile", 200));
    }catch(error){
        res.send(wrapper("failed", error.message, 500));
    }
});

app.post('/users/delete', async (req, res) => {
    try {
        const user = await FB.auth().currentUser;
        if(!user) return res.send(wrapper("error", "No User Available", 500));
        await user.delete().then(()=>{}).catch((error) => res.send(wrapper("failed", error.message, 500)));
        res.send(wrapper("success", "Success Delete User", 200));
    }catch(error){
        res.send(wrapper("failed", error.message, 500));
    }
});

app.post('/users/logout', AuthUser, async (req, res) => {
    try {
        await FB.auth().signOut();
        res.send(wrapper("success", "Logout Success", 200));
    } catch (error) {
        res.send(wrapper("failed", error.message, 500));
    }
});

// ToDos
app.post('/todos/create', upload.any(), async (req, res) => {
    try {
        const { title, description } = req.body;
        const user = await FB.auth().currentUser;
        if(!user) return res.send(wrapper("error", "No User Available", 500));
        
        const db = await FB.firestore().collection("Todos").doc(user.uid).get();
        let data_array = []
        if(db.data()) data_array = db.data().todos;
        data_array.push({title, description });

        const data = await FB.firestore().collection("Todos").doc(user.uid).set({"todos": data_array});
        res.send(wrapper("success", "Success Create Todo", 200));
    }catch(error){
        res.send(wrapper("failed", error.message, 500));
    }
});

app.get('/todos/get', AuthUser, async (req, res) => {
    try {
        const user = await FB.auth().currentUser;
        if(!user) return res.send(wrapper("error", "No User Available", 500));
        const db = await FB.firestore().collection("Todos").doc(user.uid).get();
        if(!db.data()) return res.send(wrapper("error", "No Data Available", 500));
        const data = db.data().todos;
        res.send(wrapper("success", data, 200));
    }catch(error){
        res.send(wrapper("failed", error.message, 500));
    }
});

app.post('/todos/edit', upload.any(), async (req, res) => {
    try {
        const { id, title, description } = req.body;
        
        const user = await FB.auth().currentUser;
        if(!user) return res.send(wrapper("error", "No User Available", 500));
        const db = await FB.firestore().collection("Todos").doc(user.uid).get();

        if(!db.data()) return res.send(wrapper("error", "No Data Available", 500));
        const data_array = db.data().todos;
        data_array[id-1] = {title, description };
        
        const data = await FB.firestore().collection("Todos").doc(user.uid).set({"todos": data_array});
        res.send(wrapper("success", "Success Edit Todo", 200));
    }catch(error){
        res.send(wrapper("failed", error.message, 500));
    }
});

app.post('/todos/delete', upload.any(), async (req, res) => {
    try {
        const { id } = req.body;
        
        const user = await FB.auth().currentUser;
        if(!user) return res.send(wrapper("error", "No User Available", 500));

        const db = await FB.firestore().collection("Todos").doc(user.uid).get();
        if(!db.data()) return res.send(wrapper("error", "No Data Available", 500));
        const data_array = db.data().todos;
        data_array.splice(id-1, 1);

        const data = await FB.firestore().collection("Todos").doc(user.uid).set({"todos": data_array});
        res.send(wrapper("success", "Success Delete Todo", 200));
    }catch(error){
        res.send(wrapper("failed", error.message, 500));
    }
});

// Cart
app.get('/cart/get', AuthUser, async (req, res) => {
    const user = await FB.auth().currentUser;
    const cart = await FB.firestore().collection("Cart").doc(user.uid).get();
    const data = cart.data();
    let totalPrice = 0;

    let itemsData = [];

    for(let i = 0; i < data.data.length; i++){
        let itemData = await FB.firestore().collection("Items").doc(data.data[i].DocID).get();
        // console.log(itemData.data());
        itemsData.push({
            'name': itemData.data()['Product Name'],
            'price': itemData.data().Price,
            'quantity': data.data[i].total,
            'subTotal': data.data[i].total * itemData.data().Price
        });
        totalPrice += itemData.data().Price * data.data[i].total;
    }

    const data_cart = {
        'cart': itemsData,
        'totalPrice': totalPrice
    }

    res.send(wrapper("success", data_cart, 200));
});