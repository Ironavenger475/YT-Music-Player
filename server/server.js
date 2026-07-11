require("dotenv").config();
console.log("ENV TEST:", process.env.RAPID_API_KEY);
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const { Readable } = require("stream");


const app = express();


app.use(cors());

app.use(express.json());



const PORT = 3000;



// temporary stream storage

const streams = new Map();





/*
    Receive YouTube URL

    POST /api/play

    {
       url:"https://youtube.com/watch?v=xxxx"
    }

*/

app.post("/api/play", async(req,res)=>{


    try{


        const {url}=req.body;



        if(!url){

            return res.status(400).json({

                error:"Missing URL"

            });

        }




        const rapid = await fetch(

            `https://yt-search-and-download-mp3.p.rapidapi.com/mp3?url=${encodeURIComponent(url)}`,

            {

                headers:{


                    "x-rapidapi-key":
                    process.env.RAPID_API_KEY,


                    "x-rapidapi-host":
                    "yt-search-and-download-mp3.p.rapidapi.com"


                }

            }

        );



        const data = await rapid.json();

        console.log("RapidAPI status:", rapid.status);
        console.log("RapidAPI response:", data);
        console.log("Rapid key loaded:",process.env.RAPID_API_KEY ? "YES" : "NO");

        if(!data.success){


            return res.status(500).json({

                error:"RapidAPI failed"

            });


        }



        const id =
        crypto.randomUUID();



        streams.set(id,{

            url:data.download,

            title:data.title,

            created:Date.now()

        });



        res.json({


            title:data.title,


            stream:
            `http://localhost:${PORT}/api/stream/${id}`


        });



    }
    catch(err){


        console.log(err);


        res.status(500).json({

            error:err.message

        });


    }


});








/*

    Actual MP3 stream

*/

app.get("/api/stream/:id",async(req,res)=>{


    try{


        const item =
        streams.get(req.params.id);



        if(!item){

            return res.sendStatus(404);

        }




        const response =
        await fetch(item.url);




        if(!response.ok){

            return res.sendStatus(404);

        }




        res.setHeader(

            "Content-Type",

            "audio/mpeg"

        );



        Readable

        .fromWeb(response.body)

        .pipe(res);




        res.on("close",()=>{


            streams.delete(req.params.id);


        });



    }

    catch(err){


        console.log(err);


        res.sendStatus(500);


    }


});






// delete abandoned streams

setInterval(()=>{


    const now =
    Date.now();



    for(const [id,data] of streams){


        if(
            now-data.created
            >
            10*60*1000
        ){


            streams.delete(id);


        }


    }


},600000);







app.listen(PORT,()=>{


    console.log(

        `Vinyl backend running on ${PORT}`

    );


});